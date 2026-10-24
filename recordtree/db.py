from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from importlib.resources import files
from pathlib import Path
import sqlite3

from .exceptions import ConfigError

SCHEMA_VERSION = 3
# Databases older than this were written for another workbook format and cannot be upgraded.
OLDEST_SUPPORTED_SCHEMA_VERSION = 3


def connect(database_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(database_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def initialize_schema(conn: sqlite3.Connection) -> None:
    require_supported_schema(conn)
    schema = files("recordtree").joinpath("schema.sql").read_text(encoding="utf-8")
    conn.executescript(schema)
    _migrate_schema(conn)
    conn.execute(
        """
        INSERT INTO schema_meta (key, value, updated_at)
        VALUES ('schema_version', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        """,
        (str(SCHEMA_VERSION),),
    )
    conn.commit()


def require_supported_schema(conn: sqlite3.Connection) -> None:
    """Rejects a database whose schema predates the oldest supported version."""
    if not _has_table(conn, "record_groups"):
        return
    version = _stored_schema_version(conn)
    if version is not None and version >= OLDEST_SUPPORTED_SCHEMA_VERSION:
        return
    raise ConfigError(
        f"Database {_database_file(conn)} uses schema version {version if version is not None else 'unknown'}, "
        f"which this release cannot upgrade. Move it aside and import the workbook into a new database."
    )


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """Applies idempotent upgrade steps to databases created at an older supported schema version."""


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def _stored_schema_version(conn: sqlite3.Connection) -> int | None:
    if not _has_table(conn, "schema_meta"):
        return None
    row = conn.execute("SELECT value FROM schema_meta WHERE key = 'schema_version'").fetchone()
    try:
        return int(row["value"]) if row is not None else None
    except (TypeError, ValueError):
        return None


def _database_file(conn: sqlite3.Connection) -> str:
    row = conn.execute("PRAGMA database_list").fetchone()
    return row["file"] if row is not None and row["file"] else "(memory)"


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
