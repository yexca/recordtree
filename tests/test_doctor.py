from __future__ import annotations

from pathlib import Path

from recordtree.app import RecordTreeApp
from recordtree.exceptions import ExternalToolError
from recordtree.models import MegaLoginStatus


def test_doctor_reports_passes_with_mocked_mega(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    RecordTreeApp().init()
    monkeypatch.setattr("recordtree.mega.resolve_executable", lambda configured: configured)
    monkeypatch.setattr(
        "recordtree.mega.check_login",
        lambda _whoami: MegaLoginStatus(True, 0, "Account: test"),
    )

    result = RecordTreeApp().doctor()

    assert result.ok is True
    statuses = {check.name: check.status for check in result.checks}
    assert statuses["config"] == "pass"
    assert statuses["database"] == "pass"
    assert statuses["schema"] == "pass"
    assert statuses["mega_login"] == "pass"


def test_mega_status_skips_login_when_whoami_is_unavailable(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    RecordTreeApp().init()

    def unavailable(configured: str) -> str:
        raise ExternalToolError(f"{configured} not found")

    monkeypatch.setattr("recordtree.mega.resolve_executable", unavailable)

    status = RecordTreeApp().mega_status()

    assert status.mega_whoami.available is False
    assert status.login == MegaLoginStatus(False, 1, "Skipped because mega-whoami is unavailable.")
