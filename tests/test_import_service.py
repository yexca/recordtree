from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from recordtree.db import connect, initialize_schema
from recordtree.importer.service import ImportService
from recordtree.models import ImportRecord, ImportStats, LinkItem
from recordtree.repositories import ActorRepository, ImportRepository, utc_now_sql


def _conn(tmp_path: Path):
    conn = connect(tmp_path / "test.sqlite3")
    initialize_schema(conn)
    return conn


def _link(order: int, name: str, file_type: str = ".mp4", size: int = 1024) -> LinkItem:
    return LinkItem(
        link_order=order,
        mega_url=f"https://example.invalid/file/{name}",
        file_type=file_type,
        size_bytes=size,
        formatted_size=f"{size} B",
    )


def _record(
    *,
    title: str = "Title",
    actor: str = "Actor",
    source: str = "Source",
    row: int = 2,
    links: list[LinkItem] | None = None,
) -> ImportRecord:
    return ImportRecord(
        actor_raw=actor,
        delivery_date="2026-01-02",
        title=title,
        entry_date="2026-01-03",
        note=None,
        upload_title=f"{title} upload",
        duplicate_search_raw=None,
        source_name=source,
        size_raw="1 KB",
        size_bytes=1024,
        source_row_number=row,
        links=links or [_link(1, title.casefold())],
    )


def _sync(conn, tmp_path: Path, records: list[ImportRecord]) -> ImportStats:
    source = tmp_path / "source.xlsx"
    source.write_bytes(b"placeholder")
    import_id = ImportRepository(conn).create_import(source)
    stats = ImportStats()
    ImportService(conn).sync(import_id, records, stats)
    conn.commit()
    return stats


def _link_row(conn, name: str):
    return conn.execute(
        "SELECT * FROM download_links WHERE mega_url = ?",
        (f"https://example.invalid/file/{name}",),
    ).fetchone()


def _mark_completed(conn, name: str) -> None:
    link = _link_row(conn, name)
    cursor = conn.execute(
        f"""
        INSERT INTO downloads (record_group_id, requested_at, output_dir, selected_bytes, status)
        VALUES (?, {utc_now_sql()}, '', 0, 'completed')
        """,
        (int(link["record_group_id"]),),
    )
    conn.execute(
        "INSERT INTO download_items (download_id, link_id, status) VALUES (?, ?, 'completed')",
        (int(cursor.lastrowid), int(link["id"])),
    )
    conn.commit()


def _completed(conn, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM download_items WHERE link_id = ? AND status = 'completed'",
        (int(_link_row(conn, name)["id"]),),
    ).fetchone()
    return row is not None


def _group(conn, title: str):
    return conn.execute("SELECT * FROM record_groups WHERE title = ?", (title,)).fetchone()


def _names(conn, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"SELECT name FROM {table}")}


def test_first_sync_inserts_groups_links_and_mappings(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        stats = _sync(conn, tmp_path, [_record(title="One"), _record(title="Two", actor="Other")])

        assert stats.inserted_groups == 2
        assert stats.inserted_links == 2
        assert conn.execute("SELECT COUNT(*) FROM record_group_actors").fetchone()[0] == 2
        assert conn.execute("SELECT COUNT(*) FROM record_group_sources").fetchone()[0] == 2
        assert _names(conn, "actors") == {"Actor", "Other"}
    finally:
        conn.close()


def test_repeated_sync_changes_nothing(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        _sync(conn, tmp_path, [_record()])
        stats = _sync(conn, tmp_path, [_record()])

        assert stats.unchanged_groups == 1
        assert stats.updated_groups == stats.inserted_groups == stats.removed_groups == 0
        assert stats.inserted_links == stats.removed_links == stats.link_sets_changed == 0
        assert conn.execute("SELECT COUNT(*) FROM download_links").fetchone()[0] == 1
    finally:
        conn.close()


def test_changed_link_set_keeps_listed_links_and_their_download_status(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        _sync(conn, tmp_path, [_record(links=[_link(1, "kept"), _link(2, "dropped", ".m4a")])])
        _mark_completed(conn, "kept")
        kept_id = _link_row(conn, "kept")["id"]

        changed = _record(
            links=[
                _link(1, "added", ".par2", 64),
                replace(_link(2, "kept"), file_name="[Actor][2026-01-02][Title].mp4"),
            ]
        )
        stats = _sync(conn, tmp_path, [changed])

        assert stats.link_sets_changed == 1
        assert stats.updated_groups == 1
        assert stats.inserted_links == 1
        assert stats.removed_links == 1
        kept = _link_row(conn, "kept")
        assert kept["id"] == kept_id
        assert kept["link_order"] == 2
        assert kept["file_name"] == "[Actor][2026-01-02][Title].mp4"
        assert kept["is_deleted"] == 0
        assert _completed(conn, "kept")
        assert _link_row(conn, "dropped")["is_deleted"] == 1
    finally:
        conn.close()


def test_renamed_source_keeps_the_group_and_its_downloads(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        _sync(conn, tmp_path, [_record(source="niconico")])
        _mark_completed(conn, "title")
        before = _group(conn, "Title")

        stats = _sync(conn, tmp_path, [_record(source="Twitcasting")])

        after = _group(conn, "Title")
        assert after["id"] == before["id"]
        assert after["source_name"] == "Twitcasting"
        assert after["source_key"] != before["source_key"]
        assert stats.updated_groups == 1
        assert stats.inserted_groups == stats.removed_groups == stats.link_sets_changed == 0
        assert _names(conn, "sources") == {"Twitcasting"}
        assert _completed(conn, "title")
    finally:
        conn.close()


def test_row_with_all_new_links_keeps_the_group_with_the_same_source_key(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        _sync(conn, tmp_path, [_record(links=[_link(1, "old")])])
        group_id = _group(conn, "Title")["id"]

        stats = _sync(conn, tmp_path, [_record(links=[_link(1, "reuploaded")])])

        assert _group(conn, "Title")["id"] == group_id
        assert stats.link_sets_changed == 1
        assert _link_row(conn, "old")["is_deleted"] == 1
        assert _link_row(conn, "reuploaded")["record_group_id"] == group_id
    finally:
        conn.close()


def test_rows_missing_from_the_workbook_are_removed_and_restored(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        _sync(conn, tmp_path, [_record(title="Stays"), _record(title="Goes", actor="Gone Actor", source="Gone")])
        _mark_completed(conn, "goes")
        goes_id = _group(conn, "Goes")["id"]

        removed = _sync(conn, tmp_path, [_record(title="Stays")])

        assert removed.removed_groups == 1
        assert removed.removed_links == 1
        assert _group(conn, "Goes")["is_deleted"] == 1
        assert _link_row(conn, "goes")["is_deleted"] == 1
        assert _names(conn, "actors") == {"Actor"}
        assert _names(conn, "sources") == {"Source"}

        restored = _sync(conn, tmp_path, [_record(title="Stays"), _record(title="Goes", actor="Gone Actor", source="Gone")])

        assert restored.updated_groups == 1
        assert restored.inserted_groups == 0
        assert _group(conn, "Goes")["id"] == goes_id
        assert _group(conn, "Goes")["is_deleted"] == 0
        assert _names(conn, "actors") == {"Actor", "Gone Actor"}
        assert _completed(conn, "goes")
    finally:
        conn.close()


def test_favorite_actor_stays_after_its_records_are_removed(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        _sync(conn, tmp_path, [_record(title="Stays"), _record(title="Goes", actor="Liked")])
        liked_id = int(conn.execute("SELECT id FROM actors WHERE name = 'Liked'").fetchone()[0])
        ActorRepository(conn).set_favorite(liked_id, True)
        conn.commit()

        _sync(conn, tmp_path, [_record(title="Stays")])

        assert _names(conn, "actors") == {"Actor", "Liked"}
    finally:
        conn.close()


def test_link_moved_to_another_row_follows_its_url(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        _sync(
            conn,
            tmp_path,
            [
                _record(title="First", links=[_link(1, "first"), _link(2, "moving")]),
                _record(title="Second", links=[_link(1, "second")]),
            ],
        )
        _mark_completed(conn, "moving")
        moving_id = _link_row(conn, "moving")["id"]

        stats = _sync(
            conn,
            tmp_path,
            [
                _record(title="First", links=[_link(1, "first")]),
                _record(title="Second", links=[_link(1, "second"), _link(2, "moving")]),
            ],
        )

        moving = _link_row(conn, "moving")
        assert moving["id"] == moving_id
        assert moving["record_group_id"] == _group(conn, "Second")["id"]
        assert moving["is_deleted"] == 0
        assert _completed(conn, "moving")
        assert stats.link_sets_changed == 2
        assert stats.removed_links == 0
    finally:
        conn.close()


def test_url_listed_by_two_rows_stays_on_the_first(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        stats = _sync(
            conn,
            tmp_path,
            [
                _record(title="One", row=2, links=[_link(1, "shared")]),
                _record(title="Two", row=3, links=[_link(1, "shared"), _link(2, "own")]),
            ],
        )

        assert stats.error_count == 1
        error = conn.execute("SELECT * FROM import_errors").fetchone()
        assert error["error_type"] == "duplicate_url"
        assert error["row_number"] == 3
        assert error["raw_value"] == "https://example.invalid/file/shared"
        assert _link_row(conn, "shared")["record_group_id"] == _group(conn, "One")["id"]
        assert _link_row(conn, "own")["link_order"] == 1
    finally:
        conn.close()


def test_rows_with_the_same_source_key_merge_their_links(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    try:
        source = tmp_path / "source.xlsx"
        source.write_bytes(b"placeholder")
        import_id = ImportRepository(conn).create_import(source)
        summary = ImportService(conn).sync(
            import_id,
            [_record(row=2, links=[_link(1, "a")]), _record(row=3, links=[_link(1, "b")])],
            ImportStats(),
        )

        assert summary.duplicate_source_keys == 1
        assert summary.duplicate_rows_merged == 1
        assert conn.execute("SELECT COUNT(*) FROM record_groups").fetchone()[0] == 1
        assert [row["link_order"] for row in conn.execute("SELECT link_order FROM download_links ORDER BY id")] == [1, 2]
    finally:
        conn.close()
