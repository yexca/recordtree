from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime
import sqlite3

from recordtree.exceptions import ImportRowError
from recordtree.models import ImportRecord, ImportStats, LinkItem
from recordtree.normalizers import build_source_key
from recordtree.repositories import (
    GROUP_METADATA_COLUMNS,
    ActorRepository,
    ImportRepository,
    LinkRepository,
    RecordGroupRepository,
    SourceRepository,
    group_metadata_values,
)


@dataclass(frozen=True)
class SyncSummary:
    duplicate_source_keys: int = 0
    duplicate_rows_merged: int = 0


class ImportService:
    """Makes the database mirror one workbook.

    Every valid row becomes a live record group. A row keeps the group that already owns most of
    its MEGA URLs, so metadata edits such as a source rename keep the group id. A link is identified
    by its URL, so its download history follows it through link set changes and between groups.
    Groups and links the workbook no longer lists are marked deleted, and come back when a later
    workbook lists them again.
    """

    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn
        self.imports = ImportRepository(conn)
        self.groups = RecordGroupRepository(conn)
        self.links = LinkRepository(conn)
        self.actors = ActorRepository(conn)
        self.sources = SourceRepository(conn)

    def record_error(self, import_id: int, error: ImportRowError) -> None:
        self.imports.add_import_error(
            import_id=import_id,
            row_number=error.row_number,
            source_key=error.source_key,
            error_type=error.error_type,
            message=error.message,
            raw_value=error.raw_value,
        )

    def sync(
        self,
        import_id: int,
        records: list[ImportRecord],
        stats: ImportStats,
        progress: Callable[[int, int], None] | None = None,
    ) -> SyncSummary:
        """Writes the records, then retires what they no longer list. `progress` gets (written, total)."""
        now = _utc_now()
        records, summary = _merge_duplicate_records(records)
        records = self._drop_repeated_urls(import_id, records, stats)
        keys = [build_source_key(record) for record in records]
        existing_groups = {int(row["id"]): row for row in self.groups.list_all()}
        existing_links = {row["mega_url"]: row for row in self.links.list_all()}
        assignment = _assign_groups(records, keys, existing_groups, existing_links)
        active_urls_by_group: dict[int, set[str]] = defaultdict(set)
        for row in existing_links.values():
            if not row["is_deleted"]:
                active_urls_by_group[int(row["record_group_id"])].add(row["mega_url"])

        listed_groups: set[int] = set()
        listed_links: set[int] = set()
        unchanged_links: list[int] = []
        for index, (record, source_key, group_id) in enumerate(zip(records, keys, assignment), start=1):
            if group_id is None:
                group_id = self.groups.insert_group(record, source_key, now)
                self.actors.replace_mapping(group_id, record.actor_raw)
                self.sources.replace_mapping(group_id, record.source_name)
                self._write_links(group_id, record.links, existing_links, now, stats, listed_links, unchanged_links)
                stats.inserted_groups += 1
            else:
                self._update_group(
                    group_id,
                    record,
                    source_key,
                    existing_groups[group_id],
                    existing_links,
                    active_urls_by_group[group_id],
                    now,
                    stats,
                    listed_links,
                    unchanged_links,
                )
            listed_groups.add(group_id)
            if progress is not None:
                progress(index, len(records))

        self.links.touch_links(unchanged_links, now)
        removed_links = [link_id for link_id in self.links.list_active_ids() if link_id not in listed_links]
        self.links.mark_links_deleted(removed_links, now)
        removed_groups = [group_id for group_id in self.groups.list_active_ids() if group_id not in listed_groups]
        self.groups.mark_groups_deleted(removed_groups, now)
        self.actors.remove_mappings(removed_groups)
        self.sources.remove_mappings(removed_groups)
        self.actors.prune_unused()
        self.sources.prune_unused()
        stats.removed_links += len(removed_links)
        stats.removed_groups += len(removed_groups)
        return summary

    def _update_group(
        self,
        group_id: int,
        record: ImportRecord,
        source_key: str,
        row: sqlite3.Row,
        existing_links: dict[str, sqlite3.Row],
        previous_urls: set[str],
        now: str,
        stats: ImportStats,
        listed_links: set[int],
        unchanged_links: list[int],
    ) -> None:
        revived = bool(row["is_deleted"])
        metadata_changed = tuple(row[column] for column in GROUP_METADATA_COLUMNS) != group_metadata_values(
            record, source_key
        )
        if revived or metadata_changed:
            self.groups.update_group(group_id, record, source_key, now)
        else:
            self.groups.touch_group(group_id, record.source_row_number, now)
        if revived or row["actor_raw"] != record.actor_raw:
            self.actors.replace_mapping(group_id, record.actor_raw)
        if revived or row["source_name"] != record.source_name:
            self.sources.replace_mapping(group_id, record.source_name)

        links_changed = self._write_links(group_id, record.links, existing_links, now, stats, listed_links, unchanged_links)
        links_changed = links_changed or bool(previous_urls - {item.mega_url for item in record.links})
        if links_changed:
            stats.link_sets_changed += 1
        if revived or metadata_changed or links_changed:
            stats.updated_groups += 1
        else:
            stats.unchanged_groups += 1

    def _write_links(
        self,
        group_id: int,
        items: list[LinkItem],
        existing_links: dict[str, sqlite3.Row],
        now: str,
        stats: ImportStats,
        listed_links: set[int],
        unchanged_links: list[int],
    ) -> bool:
        changed = False
        for item in items:
            existing = existing_links.get(item.mega_url)
            if existing is None:
                link_id = self.links.insert_link(group_id, item, now)
                stats.inserted_links += 1
                changed = True
            else:
                link_id = int(existing["id"])
                if _link_matches(existing, group_id, item):
                    unchanged_links.append(link_id)
                else:
                    self.links.update_link(link_id, group_id, item, now)
                    changed = True
            listed_links.add(link_id)
        return changed

    def _drop_repeated_urls(
        self,
        import_id: int,
        records: list[ImportRecord],
        stats: ImportStats,
    ) -> list[ImportRecord]:
        """Keeps each MEGA URL on the first row that lists it and reports the repeats."""
        first_rows: dict[str, int | None] = {}
        kept: list[ImportRecord] = []
        for record in records:
            links: list[LinkItem] = []
            for item in record.links:
                if item.mega_url in first_rows:
                    self.record_error(
                        import_id,
                        ImportRowError(
                            "duplicate_url",
                            f"MEGA URL is already listed in row {first_rows[item.mega_url]}.",
                            row_number=record.source_row_number,
                            source_key=build_source_key(record),
                            raw_value=item.mega_url,
                        ),
                    )
                    stats.error_count += 1
                    continue
                first_rows[item.mega_url] = record.source_row_number
                links.append(item)
            if len(links) == len(record.links):
                kept.append(record)
            elif links:
                kept.append(replace(record, links=_renumber(links)))
        return kept


def _merge_duplicate_records(records: list[ImportRecord]) -> tuple[list[ImportRecord], SyncSummary]:
    """Merges rows with the same source key into one record that lists the links of all of them."""
    merged: dict[str, ImportRecord] = {}
    duplicate_keys: set[str] = set()
    duplicate_rows = 0
    for record in records:
        source_key = build_source_key(record)
        first = merged.get(source_key)
        if first is None:
            merged[source_key] = record
            continue
        duplicate_keys.add(source_key)
        duplicate_rows += 1
        urls = {item.mega_url for item in first.links}
        extra = [item for item in record.links if item.mega_url not in urls]
        merged[source_key] = replace(first, links=_renumber(first.links + extra))
    summary = SyncSummary(duplicate_source_keys=len(duplicate_keys), duplicate_rows_merged=duplicate_rows)
    return list(merged.values()), summary


def _assign_groups(
    records: list[ImportRecord],
    keys: list[str],
    existing_groups: dict[int, sqlite3.Row],
    existing_links: dict[str, sqlite3.Row],
) -> list[int | None]:
    """Picks the existing group each record updates, or None for a new group.

    A record first claims the group that owns the most of its URLs; a record whose URLs are all new
    claims an unclaimed group with the same source key. Each group is claimed at most once.
    """
    assignment: list[int | None] = [None] * len(records)
    claimed: set[int] = set()
    candidates: list[tuple[int, int, int]] = []
    for index, record in enumerate(records):
        owners = Counter(
            int(existing_links[item.mega_url]["record_group_id"])
            for item in record.links
            if item.mega_url in existing_links
        )
        candidates.extend((-shared, index, group_id) for group_id, shared in owners.items())
    for _, index, group_id in sorted(candidates):
        if assignment[index] is None and group_id not in claimed:
            assignment[index] = group_id
            claimed.add(group_id)

    groups_by_key: dict[str, list[int]] = defaultdict(list)
    for group_id, row in existing_groups.items():
        groups_by_key[row["source_key"]].append(group_id)
    for index, source_key in enumerate(keys):
        if assignment[index] is not None:
            continue
        # Prefer a live group, then the newest one.
        for group_id in sorted(groups_by_key.get(source_key, ()), key=lambda gid: (existing_groups[gid]["is_deleted"], -gid)):
            if group_id not in claimed:
                assignment[index] = group_id
                claimed.add(group_id)
                break
    return assignment


def _link_matches(row: sqlite3.Row, group_id: int, item: LinkItem) -> bool:
    return (
        not row["is_deleted"]
        and int(row["record_group_id"]) == group_id
        and int(row["link_order"]) == item.link_order
        and row["file_name"] == item.file_name
        and row["file_type"] == item.file_type
        and int(row["size_bytes"]) == item.size_bytes
        and row["formatted_size"] == item.formatted_size
    )


def _renumber(links: list[LinkItem]) -> list[LinkItem]:
    return [replace(link, link_order=index) for index, link in enumerate(links, start=1)]


def _utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
