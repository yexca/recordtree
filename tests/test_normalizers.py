from __future__ import annotations

from datetime import date, datetime

import pytest

from recordtree.exceptions import ValidationError
from recordtree.models import ImportRecord
from recordtree.normalizers import (
    build_source_key,
    clean_text,
    normalize_date,
    normalize_file_type,
    normalize_search_text,
    split_file_type,
)


def _record(*, title: str = "Title", source: str = "Source", delivery_date: str | None = "2026-01-02") -> ImportRecord:
    return ImportRecord(
        actor_raw=" Actor ",
        delivery_date=delivery_date,
        title=title,
        entry_date="2026-01-03",
        note=None,
        upload_title="Upload",
        duplicate_search_raw=None,
        source_name=source,
        size_raw=None,
        size_bytes=3,
        source_row_number=2,
        links=[],
    )


def test_text_file_type_and_date_normalization() -> None:
    assert clean_text(None) is None
    assert clean_text("   ") is None
    assert clean_text("  value  ") == "value"
    assert normalize_search_text("  MIXED  ") == "mixed"
    assert normalize_file_type("mp4") == ".mp4"
    assert normalize_file_type(".MP4") == ".mp4"
    assert normalize_date(datetime(2026, 1, 2, 3, 4, 5)) == "2026-01-02"
    assert normalize_date(date(2026, 1, 2)) == "2026-01-02"
    assert normalize_date("2026-01-02") == "2026-01-02"
    assert normalize_date("2026/01/02") == "2026-01-02"
    assert normalize_date("") is None


def test_invalid_date_raises_validation_error() -> None:
    with pytest.raises(ValidationError):
        normalize_date("not-a-date")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("mp4", (None, ".mp4")),
        (".MP4", (None, ".mp4")),
        (".exe\r\n", (None, ".exe")),
        ("[Actor][2026-01-02][Title][2026-01-03].mp4", ("[Actor][2026-01-02][Title][2026-01-03].mp4", ".mp4")),
        ("[Actor][2026-01-02][Title 1.5][2026-01-03][1].M4A", ("[Actor][2026-01-02][Title 1.5][2026-01-03][1].M4A", ".m4a")),
        ("", (None, None)),
        (None, (None, None)),
    ],
)
def test_split_file_type_separates_file_names_from_extensions(raw: object, expected: tuple[str | None, str | None]) -> None:
    assert split_file_type(raw) == expected
    assert normalize_file_type(raw) == expected[1]


def test_source_key_is_stable_and_sensitive() -> None:
    assert build_source_key(_record()) == build_source_key(_record())
    assert build_source_key(_record(title="Changed")) != build_source_key(_record())
    assert build_source_key(_record(source="Changed")) != build_source_key(_record())
    assert build_source_key(_record(delivery_date="2026-02-02")) != build_source_key(_record())
