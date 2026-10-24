from __future__ import annotations

from datetime import date, datetime
import hashlib
import json
import math

from .exceptions import ValidationError
from .models import ImportRecord


def clean_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    return text or None


def normalize_search_text(value: object) -> str:
    cleaned = clean_text(value)
    return "" if cleaned is None else cleaned.casefold()


def normalize_date(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # Excel serial dates are intentionally not guessed here; openpyxl usually
        # returns typed date objects for date-formatted cells.
        if isinstance(value, float) and math.isnan(value):
            return None
        value = int(value) if float(value).is_integer() else value
    text = clean_text(value)
    if text is None:
        return None

    normalized = text.replace("/", "-").replace(".", "-")
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(normalized, fmt).date().isoformat()
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(text).date().isoformat()
    except ValueError as error:
        raise ValidationError(f"Invalid date value: {text}") from error


def split_file_type(value: object) -> tuple[str | None, str | None]:
    """Splits a MEGA `Type` value into a file name and a lower-case extension with a leading dot.

    The value is either an extension (`mp4`, `.MP4`) or a full file name (`[actor][date].mp4`).
    """
    text = clean_text(value)
    if text is None:
        return None, None
    stem, dot, extension = text.rpartition(".")
    if not dot:
        return None, f".{text.casefold()}"
    if not extension.strip():
        return (text if stem else None), None
    return (text if stem else None), f".{extension.strip().casefold()}"


def normalize_file_type(value: object) -> str | None:
    return split_file_type(value)[1]


def build_source_key(record: ImportRecord) -> str:
    payload = {
        "actor_raw": normalize_search_text(record.actor_raw),
        "delivery_date": record.delivery_date,
        "title": normalize_search_text(record.title),
        "entry_date": record.entry_date,
        "upload_title": normalize_search_text(record.upload_title),
        "source_name": normalize_search_text(record.source_name),
    }
    return _hash_payload(payload)


def _hash_payload(payload: object) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
