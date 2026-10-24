# CLI Guide

The CLI entry point is `recordtree`.

## Initialize

```bash
recordtree init
```

Default runtime paths, relative to the working directory:

- Config: `config/config.toml`
- Database: `config/recordtree.sqlite3`
- Logs: `config/logs/`
- Import error CSVs: `config/logs/import_<import_id>_errors.csv`
- Download output logs: `config/logs/downloads/download_<download_id>.log`
- Database backups: `config/logs/backups/`
- Downloads: `downloads/`
- Cache: `cache/`, which holds files uploaded through the WebUI under `cache/uploads/` until they are imported

The `[paths]` section of `config/config.toml` sets the logs, downloads, and cache locations.

## Import Data

Pass the Record Tree Excel export to import:

```bash
recordtree import "D:/exports/recordtree-export.xlsx"
```

Without a path, `recordtree import` opens a file picker. Where no picker can open, such as in a container or an SSH session, it asks for the full path of the file instead. Cancelling the picker stops the import.

Each import makes the library match the workbook: new rows are added, edited rows are updated, and records the workbook no longer lists are hidden. Download status belongs to each MEGA link, so it survives edits to a row and comes back with a record that reappears in a later workbook. [Import Synchronization](../maintainer-guide/data-contract.md#import-synchronization) has the exact rules.

## Search And Inspect

```bash
recordtree search-actor "<name>"
recordtree actor-records 12
recordtree search-source niconico
recordtree search-title ASMR
recordtree search-date --from 2026-01-01 --to 2026-01-31
recordtree list-undownloaded --limit 20
recordtree list-undownloaded --actor-id 12 --limit 20
recordtree info 123
recordtree stats
```

Search commands are case-insensitive and default to a limit of 50 rows.

## Download

Log in with MEGAcmd first:

```bash
mega-login
recordtree doctor
```

Examples:

```bash
recordtree download 123 --types mp4,m4a
recordtree download 123 --include-par2 --yes
recordtree download 123 --output "D:/RecordTree/123"
recordtree download --actor 12 --count 5 --yes
```

By default, `.par2` files are excluded. Use `--include-par2` to include them.

When `--output` is omitted, downloads are stored under the configured downloads root using the folder template from `config/config.toml`. The default template is:

```text
{actor_safe_name}/{record_group_id}
```

With the default downloads root, this produces paths like `downloads/Actor Name/123/`.

Each download attempt records item status in SQLite. When MEGAcmd runs, its streamed output is also written to `config/logs/downloads/download_<download_id>.log`.
