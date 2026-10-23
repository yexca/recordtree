# WebUI Guide

The WebUI provides a browser interface for the same local workflows as the CLI.

## Start With Docker

```bash
docker compose build
docker compose up -d
docker compose exec recordtree-web recordtree init
docker compose exec recordtree-web mega-login
docker compose exec recordtree-web recordtree doctor
```

Open:

```text
http://127.0.0.1:7647
```

## Main Areas

The sidebar groups pages into Overview, Library, Transfers, and System. Running download and import jobs show a live count next to their page. The sidebar also has a light/dark/system theme switch and an **Open record** box: type a record ID or source key and press Enter (press `/` anywhere to focus it).

- Dashboard: database totals, download coverage, recent downloads and imports, and a banner while background jobs run.
- Records: one search page for title, record ID, actor, platform, delivery date range, and download status (complete, partial, not downloaded, no links, or pending links). Old `#/search` links open this page.
- Actors and Platforms: a searchable directory (by name or ID) with a workspace for the selected entry: coverage, a filterable record list, and inline record detail. On the Actors page, **Queue downloads** starts one background job for the actor's newest records that still have undownloaded links.
- Record detail: metadata, active links (with copy buttons), and the download planner.
- Downloads: live MEGAcmd output for active jobs, plus history filtered by status. Select a row to open its files, output log, and resume action.
- Import: upload Excel, legacy JSON, or legacy SQLite files, follow background progress, and open any past import to see its row errors.
- Settings: download folder template (with a live example path), disk-space safety limits, `.par2` default, and the MEGAcmd account.
- Maintenance: local health checks, database tools (backup, integrity, orphans, analyze, vacuum), backups, and an on-demand MEGAcmd check.

## Downloads

The WebUI builds a download plan before starting MEGAcmd. Changing an option discards the current plan, so the plan you confirm always matches the options that will run. You can choose:

- Whether to include `.par2`
- File type filters such as `mp4,m4a`
- Output directory
- Only undownloaded links

Settings > Downloads controls the default downloads root, the folder template, the `.par2` default used by new plans, and the disk-space safety limits. The default folder template is `{actor_safe_name}/{record_group_id}`, which produces actor folders under the downloads root.

Downloads run as background jobs. The UI polls job status and displays captured MEGAcmd output for active jobs. Completed download details also expose persisted MEGAcmd output when a log file is available.

Download output logs are written under:

```text
logs/downloads/download_<download_id>.log
```
