from __future__ import annotations

import json
from pathlib import Path
import threading

import pytest

from recordtree.models import DownloadExecutionResult
from recordtree.web.jobs import MAX_FINISHED_JOBS, MAX_JOB_EVENTS, MAX_OUTPUT_TAIL_CHARS, JobManager
from recordtree.web.schemas import DownloadRequest


def test_job_output_and_events_are_bounded_and_list_responses_are_summaries(tmp_path: Path) -> None:
    manager = JobManager()
    output_ready = threading.Event()
    finish = threading.Event()
    output = "x" * (4096 * 300) + "\nfinished output\n"

    class DownloadApp:
        def download(self, *, output_callback, **_kwargs):
            output_callback(output)
            output_ready.set()
            assert finish.wait(timeout=5)
            return DownloadExecutionResult(1, 1, "completed", 1, 0, tmp_path)

    try:
        created = manager.start_download(DownloadRequest(record_id_or_key="1"), app_factory=DownloadApp)
        assert output_ready.wait(timeout=5)
        job = manager.get(created.id)
        assert len(job.events) <= MAX_JOB_EVENTS
        indexes = [event.index for event in job.events]
        assert indexes == sorted(set(indexes))
        assert indexes[0] > 1
        assert job.output_tail == output[-MAX_OUTPUT_TAIL_CHARS:]
        assert len(manager.sse_payloads(job.id, after=indexes[-2])) == 1

        summary = manager.serialize(manager.list(active=True)[0])
        assert summary["events"] == []
        assert summary["output_tail"] == job.output_tail
        assert len(json.dumps(summary)) < 20 * 1024
    finally:
        finish.set()
        manager._executor.shutdown(wait=True)
    completed = manager.get(created.id)
    assert completed.status == "completed"
    assert completed.events[-1].index > indexes[-1]
    assert completed.events[-1].type == "completed"


def test_finished_job_retention_keeps_active_jobs(tmp_path: Path) -> None:
    manager = JobManager()
    finish = threading.Event()

    class ImportApp:
        def import_file(self, _source_path, progress_callback=None):
            return {"ok": True}

    class BlockingImportApp(ImportApp):
        def import_file(self, source_path, progress_callback=None):
            assert finish.wait(timeout=10)
            return super().import_file(source_path, progress_callback)

    source = tmp_path / "synthetic.xlsx"
    try:
        active = manager.start_import(source, app_factory=BlockingImportApp)
        completed_ids = []
        for _ in range(MAX_FINISHED_JOBS + 2):
            completed = manager.start_import(source, app_factory=ImportApp)
            # The second worker completes the import before processing this barrier.
            manager._executor.submit(lambda: None).result(timeout=5)
            completed_ids.append(completed.id)
        assert manager.get(active.id).status in {"queued", "running"}
        assert len(manager.list(active=False)) == MAX_FINISHED_JOBS
        assert manager.get(completed_ids[-1]).status == "completed"
        with pytest.raises(KeyError):
            manager.get(completed_ids[0])
    finally:
        finish.set()
        manager._executor.shutdown(wait=True)
