from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest

from recordtree.app import RecordTreeApp
from recordtree.db import connect
from recordtree.exceptions import ValidationError
from recordtree.importer.service import ImportService
from recordtree.models import ImportRecord, ImportStats, LinkItem, MegaCommandResult, MegaLoginStatus
from recordtree.repositories import ImportRepository, utc_now_sql


def _record() -> ImportRecord:
    return ImportRecord(
        actor_raw="Download Actor",
        delivery_date="2026-01-02",
        title="Download title",
        entry_date="2026-01-03",
        note=None,
        upload_title="Download upload",
        duplicate_search_raw=None,
        source_name="Source",
        size_raw=None,
        size_bytes=600,
        source_row_number=2,
        links=[
            LinkItem(1, "https://example.invalid/d/1", ".mp4", 100, "100 B"),
            LinkItem(2, "https://example.invalid/d/2", ".m4a", 200, "200 B"),
            LinkItem(3, "https://example.invalid/d/3", ".par2", 300, "300 B"),
        ],
    )


def _actor_record(index: int) -> ImportRecord:
    return ImportRecord(
        actor_raw="Batch Actor",
        delivery_date=f"2026-01-{index:02d}",
        title=f"Batch title {index}",
        entry_date=f"2026-02-{index:02d}",
        note=None,
        upload_title=f"Batch upload {index}",
        duplicate_search_raw=None,
        source_name="Source",
        size_raw=None,
        size_bytes=100,
        source_row_number=index,
        links=[LinkItem(1, f"https://example.invalid/batch/{index}", ".mp4", 100, "100 B")],
    )


def _setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.chdir(tmp_path)
    RecordTreeApp().init()
    conn = connect(tmp_path / "config" / "recordtree.sqlite3")
    try:
        source = tmp_path / "fixture.xlsx"
        source.write_bytes(b"xlsx placeholder")
        import_id = ImportRepository(conn).create_import(source)
        ImportService(conn).sync(import_id, [_record()], ImportStats())
        group_id = int(conn.execute("SELECT id FROM record_groups").fetchone()[0])
        conn.commit()
        return group_id
    finally:
        conn.close()


def _setup_batch_actor(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.chdir(tmp_path)
    RecordTreeApp().init()
    conn = connect(tmp_path / "config" / "recordtree.sqlite3")
    try:
        source = tmp_path / "fixture.xlsx"
        source.write_bytes(b"xlsx placeholder")
        import_id = ImportRepository(conn).create_import(source)
        ImportService(conn).sync(import_id, [_actor_record(index) for index in range(1, 6)], ImportStats())
        actor_id = int(conn.execute("SELECT id FROM actors WHERE name = ?", ("Batch Actor",)).fetchone()[0])
        conn.commit()
        return actor_id
    finally:
        conn.close()


def _insert_download(conn, group_id: int, link_id: int, status: str) -> None:
    cursor = conn.execute(
        f"""
        INSERT INTO downloads (
            record_group_id, requested_at, output_dir, selected_bytes,
            free_bytes_before, status, mega_exit_code, message
        )
        VALUES (?, {utc_now_sql()}, '', 0, NULL, ?, NULL, NULL)
        """,
        (group_id, status),
    )
    conn.execute(
        f"""
        INSERT INTO download_items (
            download_id, link_id, status, started_at, finished_at, mega_exit_code, message
        )
        VALUES (?, ?, ?, {utc_now_sql()}, {utc_now_sql()}, 0, NULL)
        """,
        (int(cursor.lastrowid), link_id, status),
    )


def test_download_plan_filters_and_required_bytes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    group_id = _setup(tmp_path, monkeypatch)
    app = RecordTreeApp()

    default_plan = app.build_download_plan(str(group_id))
    assert [link.file_type for link in default_plan.selected_links] == [".mp4", ".m4a"]
    assert default_plan.selected_bytes == 300
    assert default_plan.margin_bytes == 10240 * 1024 * 1024
    assert default_plan.output_dir == tmp_path / "downloads" / "Download Actor" / str(group_id)

    par2_plan = app.build_download_plan(str(group_id), include_par2=True)
    assert [link.file_type for link in par2_plan.selected_links] == [".mp4", ".m4a", ".par2"]

    typed = app.build_download_plan(str(group_id), types="mp4,m4a")
    assert {link.file_type for link in typed.selected_links} == {".mp4", ".m4a"}

    with pytest.raises(ValidationError) as error:
        app.build_download_plan(str(group_id), types="par2")
    assert "No links selected" in str(error.value)


def test_download_plan_selects_chosen_links(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    group_id = _setup(tmp_path, monkeypatch)
    conn = connect(tmp_path / "config" / "recordtree.sqlite3")
    try:
        link_ids = {
            row["file_type"]: int(row["id"])
            for row in conn.execute("SELECT id, file_type FROM download_links").fetchall()
        }
        _insert_download(conn, group_id, link_ids[".mp4"], "completed")
        conn.commit()
    finally:
        conn.close()
    app = RecordTreeApp()

    # Chosen links skip the .par2 and type filters and keep link order.
    chosen = app.build_download_plan(str(group_id), types="m4a", link_ids=[link_ids[".par2"], link_ids[".mp4"]])
    assert [link.file_type for link in chosen.selected_links] == [".mp4", ".par2"]
    assert chosen.selected_bytes == 400
    assert chosen.include_par2 is True
    assert chosen.type_filter is None

    with pytest.raises(ValidationError, match="already downloaded"):
        app.build_download_plan(str(group_id), only_undownloaded=True, link_ids=[link_ids[".mp4"]])
    with pytest.raises(ValidationError, match="No links selected"):
        app.build_download_plan(str(group_id), link_ids=[])
    with pytest.raises(ValidationError, match="Not active links"):
        app.build_download_plan(str(group_id), link_ids=[link_ids[".mp4"], 999])


def test_download_success_failure_and_preflight_blocks(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    free_disk_space: Callable[[int], None],
) -> None:
    group_id = _setup(tmp_path, monkeypatch)
    calls: list[str] = []
    monkeypatch.setattr("recordtree.mega.resolve_executable", lambda configured: configured)
    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(True, 0, "Account: test"),
    )

    def fake_download(
        _mega_get: str,
        url: str,
        _output_dir: Path,
        output_callback=None,
    ) -> MegaCommandResult:
        calls.append(url)
        if url.endswith("/2"):
            return MegaCommandResult(1, "bad", "failed")
        return MegaCommandResult(0, "ok", "")

    monkeypatch.setattr("recordtree.mega.download_link", fake_download)

    result = RecordTreeApp().download(str(group_id), types="mp4,m4a", assume_yes=True)

    assert result.status == "failed"
    assert result.completed == 1
    assert result.failed == 1
    assert len(calls) == 2

    conn = connect(tmp_path / "config" / "recordtree.sqlite3")
    try:
        assert conn.execute("SELECT status FROM downloads WHERE id = ?", (result.download_id,)).fetchone()[0] == "failed"
        statuses = {
            row["status"]
            for row in conn.execute("SELECT status FROM download_items").fetchall()
        }
        assert {"completed", "failed"} <= statuses
    finally:
        conn.close()

    calls.clear()
    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(False, 1, "not logged in"),
    )
    blocked = RecordTreeApp().download(str(group_id), types="mp4", assume_yes=True)
    assert blocked.status == "blocked"
    assert calls == []

    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(True, 0, "Account: test"),
    )
    free_disk_space(1024)
    no_space = RecordTreeApp().download(str(group_id), types="mp4", assume_yes=True)
    assert no_space.status == "blocked"
    assert "Insufficient disk space" in no_space.message
    assert calls == []


def test_download_forwards_megacmd_output_callback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    group_id = _setup(tmp_path, monkeypatch)
    output_chunks: list[str] = []
    monkeypatch.setattr("recordtree.mega.resolve_executable", lambda configured: configured)
    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(True, 0, "Account: test"),
    )

    def fake_download(
        _mega_get: str,
        _url: str,
        _output_dir: Path,
        output_callback=None,
    ) -> MegaCommandResult:
        assert output_callback is not None
        output_callback("downloading\r100%\n")
        return MegaCommandResult(0, "downloading\r100%\n", "")

    monkeypatch.setattr("recordtree.mega.download_link", fake_download)

    result = RecordTreeApp().download(
        str(group_id),
        types="mp4",
        assume_yes=True,
        output_callback=output_chunks.append,
    )

    assert result.status == "completed"
    assert output_chunks == ["downloading\r100%\n"]
    log_path = tmp_path / "config" / "logs" / "downloads" / f"download_{result.download_id}.log"
    with log_path.open("r", encoding="utf-8", newline="") as handle:
        assert handle.read() == "downloading\r100%\n"


def test_download_cancelled_records_row(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    group_id = _setup(tmp_path, monkeypatch)
    monkeypatch.setattr("recordtree.mega.resolve_executable", lambda configured: configured)
    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(True, 0, "Account: test"),
    )
    monkeypatch.setattr(
        "recordtree.mega.download_link",
        lambda *_args, **_kwargs: MegaCommandResult(0, "ok", ""),
    )

    result = RecordTreeApp().download(
        str(group_id),
        types="mp4",
        assume_yes=False,
        confirm_callback=lambda _plan: False,
    )

    assert result.status == "cancelled"
    assert not (tmp_path / "downloads" / str(group_id)).exists()
    conn = connect(tmp_path / "config" / "recordtree.sqlite3")
    try:
        assert conn.execute("SELECT status FROM downloads WHERE id = ?", (result.download_id,)).fetchone()[0] == "cancelled"
    finally:
        conn.close()


def test_download_actor_defaults_to_three_undownloaded_records(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_id = _setup_batch_actor(tmp_path, monkeypatch)
    calls: list[str] = []
    monkeypatch.setattr("recordtree.mega.resolve_executable", lambda configured: configured)
    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(True, 0, "Account: test"),
    )

    def fake_download(
        _mega_get: str,
        url: str,
        _output_dir: Path,
        output_callback=None,
    ) -> MegaCommandResult:
        calls.append(url)
        return MegaCommandResult(0, "ok", "")

    monkeypatch.setattr("recordtree.mega.download_link", fake_download)

    result = RecordTreeApp().download_actor(actor_id, assume_yes=True)

    assert result.selected_count == 3
    assert [item.status for item in result.results] == ["completed", "completed", "completed"]
    assert len(calls) == 3


def test_download_actor_reports_when_nothing_is_undownloaded(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_id = _setup_batch_actor(tmp_path, monkeypatch)
    monkeypatch.setattr("recordtree.mega.resolve_executable", lambda configured: configured)
    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(True, 0, "Account: test"),
    )
    monkeypatch.setattr(
        "recordtree.mega.download_link",
        lambda *_args, **_kwargs: MegaCommandResult(0, "ok", ""),
    )

    RecordTreeApp().download_actor(actor_id, limit=5, assume_yes=True)
    result = RecordTreeApp().download_actor(actor_id, assume_yes=True)

    assert result.selected_count == 0
    assert result.results == []
    assert result.message == f"No undownloaded records found for actor id {actor_id}."


def test_download_actor_skips_completed_links_in_partial_records(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    group_id = _setup(tmp_path, monkeypatch)
    conn = connect(tmp_path / "config" / "recordtree.sqlite3")
    try:
        actor_id = int(conn.execute("SELECT id FROM actors WHERE name = ?", ("Download Actor",)).fetchone()[0])
        completed_link_id = int(
            conn.execute(
                "SELECT id FROM download_links WHERE mega_url = ?",
                ("https://example.invalid/d/1",),
            ).fetchone()[0]
        )
        _insert_download(conn, group_id, completed_link_id, "completed")
        conn.commit()
    finally:
        conn.close()

    calls: list[str] = []
    monkeypatch.setattr("recordtree.mega.resolve_executable", lambda configured: configured)
    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(True, 0, "Account: test"),
    )

    def fake_download(
        _mega_get: str,
        url: str,
        _output_dir: Path,
        output_callback=None,
    ) -> MegaCommandResult:
        calls.append(url)
        return MegaCommandResult(0, "ok", "")

    monkeypatch.setattr("recordtree.mega.download_link", fake_download)

    result = RecordTreeApp().download_actor(actor_id, assume_yes=True)

    assert result.selected_count == 1
    assert calls == ["https://example.invalid/d/2"]
