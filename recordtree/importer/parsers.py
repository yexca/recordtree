from __future__ import annotations

import json

from recordtree.exceptions import ImportRowError
from recordtree.models import LinkItem
from recordtree.normalizers import clean_text, split_file_type


def parse_mega_json(raw: object, row_number: int | None = None) -> list[LinkItem]:
    text = clean_text(raw)
    if text is None:
        raise ImportRowError(
            "mega_json_parse_error",
            "MEGA JSON is empty.",
            row_number=row_number,
            raw_value=raw,
        )
    try:
        # The export writes some Type values with raw line breaks, which strict JSON rejects.
        root = json.loads(text, strict=False)
    except json.JSONDecodeError as error:
        raise ImportRowError(
            "mega_json_parse_error",
            f"MEGA JSON could not be parsed: {error.msg}",
            row_number=row_number,
            raw_value=text,
        ) from error
    if root is None:
        # The export writes null for a row whose files have no MEGA links yet.
        return []
    if not isinstance(root, dict):
        raise ImportRowError(
            "mega_json_invalid_root",
            "MEGA JSON root must be an object.",
            row_number=row_number,
            raw_value=text,
        )
    property_items = root.get("property")
    if not isinstance(property_items, list):
        raise ImportRowError(
            "mega_property_invalid",
            "MEGA property must be a list.",
            row_number=row_number,
            raw_value=text,
        )
    if not property_items:
        raise ImportRowError(
            "mega_property_empty",
            "MEGA property list is empty.",
            row_number=row_number,
            raw_value=text,
        )
    return [_parse_link_item(item, index + 1, row_number) for index, item in enumerate(property_items)]


def _parse_link_item(item: object, order: int, row_number: int | None) -> LinkItem:
    if not isinstance(item, dict):
        raise ImportRowError(
            "mega_property_invalid",
            "Each MEGA property item must be an object.",
            row_number=row_number,
            raw_value=item,
        )
    link = clean_text(item.get("Link"))
    if link is None:
        raise ImportRowError(
            "mega_link_missing",
            "MEGA link is missing.",
            row_number=row_number,
            raw_value=item,
        )
    size = _required_int(item.get("Size"), "mega_size_invalid", row_number)
    if size < 0:
        raise ImportRowError(
            "mega_size_invalid",
            "MEGA size must be non-negative.",
            row_number=row_number,
            raw_value=size,
        )
    file_name, file_type = split_file_type(item.get("Type"))
    return LinkItem(
        link_order=order,
        mega_url=link,
        file_name=file_name,
        file_type=file_type,
        size_bytes=size,
        formatted_size=clean_text(item.get("FormattedSize")),
    )


def _required_int(value: object, error_type: str, row_number: int | None) -> int:
    try:
        if isinstance(value, bool):
            raise ValueError
        return int(value)
    except (TypeError, ValueError) as error:
        raise ImportRowError(
            error_type,
            "MEGA size must be an integer.",
            row_number=row_number,
            raw_value=value,
        ) from error
