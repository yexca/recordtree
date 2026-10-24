from __future__ import annotations

import json

import pytest

from recordtree.exceptions import ImportRowError
from recordtree.importer.parsers import parse_mega_json


def test_parse_mega_json_valid_payload_and_numeric_string_size() -> None:
    payload = {
        "FileNames": "bundle",
        "total": "123",
        "FormattedSize": "123 B",
        "property": [
            {
                "Link": "https://example.invalid/file",
                "Size": "123",
                "FormattedSize": "123 B",
                "Type": "MP4",
            }
        ],
    }

    links = parse_mega_json(json.dumps(payload), row_number=7)

    assert len(links) == 1
    assert links[0].link_order == 1
    assert links[0].mega_url == "https://example.invalid/file"
    assert links[0].size_bytes == 123
    assert links[0].formatted_size == "123 B"
    assert links[0].file_type == ".mp4"
    assert links[0].file_name is None


def test_parse_mega_json_reads_file_names_from_type() -> None:
    payload = {
        "property": [
            {"Link": "https://example.invalid/1", "Size": 1, "Type": "[Actor][2026-01-02][Title][2026-01-03].mp4"},
            {"Link": "https://example.invalid/2", "Size": 2, "Type": ".par2"},
        ]
    }

    links = parse_mega_json(json.dumps(payload))

    assert [(link.file_name, link.file_type) for link in links] == [
        ("[Actor][2026-01-02][Title][2026-01-03].mp4", ".mp4"),
        (None, ".par2"),
    ]


def test_parse_mega_json_accepts_raw_line_breaks_inside_strings() -> None:
    text = '{"property": [{"Link": "https://example.invalid/file", "Size": 1, "Type": ".exe\r\n"}]}'

    links = parse_mega_json(text)

    assert links[0].file_type == ".exe"


@pytest.mark.parametrize(
    ("raw", "error_type"),
    [
        ("", "mega_json_parse_error"),
        ("{not json", "mega_json_parse_error"),
        ("null", "mega_json_invalid_root"),
        ("[]", "mega_json_invalid_root"),
        ("{}", "mega_property_invalid"),
        ('{"property": {}}', "mega_property_invalid"),
        ('{"property": []}', "mega_property_empty"),
        ('{"property": [{"Size": 1, "Type": "mp4"}]}', "mega_link_missing"),
        ('{"property": [{"Link": "https://example.invalid/file", "Size": "bad"}]}', "mega_size_invalid"),
        ('{"property": [{"Link": "https://example.invalid/file", "Size": -1}]}', "mega_size_invalid"),
    ],
)
def test_parse_mega_json_reports_invalid_shapes(raw: str, error_type: str) -> None:
    with pytest.raises(ImportRowError) as error:
        parse_mega_json(raw, row_number=3)

    assert error.value.error_type == error_type
    assert error.value.row_number == 3


def test_parse_mega_json_allows_missing_type() -> None:
    links = parse_mega_json('{"property": [{"Link": "https://example.invalid/file", "Size": 1}]}')

    assert links[0].file_type is None
    assert links[0].file_name is None
