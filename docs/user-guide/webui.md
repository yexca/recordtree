# WebUI Guide

The WebUI provides a browser interface for the same local workflows as the CLI.

## Start With Docker

Download `docker-compose.yml` as described in [Docker deployment](docker.md#start), then run:

```bash
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
- Records: one search page. The search box filters titles as you type (type `#123` to find a record by ID); **Filters** adds actor, platform, delivery date range, and file type, shown as removable chips. Status tabs (all, pending, complete, partial, not downloaded, no links) show how many records match each. Click a column header to sort. Selecting a row opens the record in a side drawer next to the list (an overlay on narrower screens), where clicking the actor or platform filters the list. The filters, sort, page, and open record are kept in the URL, so Back/Forward, reloads, and shared links return to the same view. Old `#/search` links open this page.
- Actors: a paged card grid you can search by name (or `#ID`), sort, and narrow to favorites. The heart on a card adds the actor to favorites; with **Favorites first** on, favorites are listed ahead of everyone else. Opening a card shows all of the actor's records with the same search, status tabs, filters and detail drawer as Records, and **Queue downloads** starts one background job for the actor's newest records that still have undownloaded links.
- Platforms: a searchable directory (by name or ID) with a workspace for the selected entry: coverage, a filterable record list, and inline record detail.
- Record detail: metadata, active links with checkboxes, file names and copy buttons, and the download planner. It opens as a drawer from Records; the drawer's expand button opens the full page.
- Downloads: live MEGAcmd output for active jobs, plus history filtered by status. Select a row to open its files, output log, and resume action.
- Import: upload the Excel export, follow background progress, and open any past import to see its row errors. Each import syncs the library to the workbook, as described in [Import Data](cli.md#import-data).
- Settings: download folder template (with a live example path), disk-space safety limits, `.par2` default, and the MEGAcmd account.
- Maintenance: local health checks, database tools (backup, integrity, orphans, analyze, vacuum), backups, and an on-demand MEGAcmd check.

## Downloads

A record downloads the links you check in its links table. Quick filters above the table check links for you:

- **Not downloaded**: only links that do not have a completed download.
- One chip per file type in the record, such as `.mp4` or `.par2`, with its link count: turn a type off to leave its links unchecked.

The filters start from the not-downloaded links, without `.par2` unless Settings includes it by default. Changing a filter checks the matching links again; after that, check or uncheck single links, or use the header checkbox to select all or none. A checked link that is already downloaded is downloaded again.

The WebUI builds a download plan for the checked links and the output folder before starting MEGAcmd. Changing either discards the current plan, so the plan you confirm always matches what will run. Resuming a download of checked links downloads the ones that are still not downloaded.

Settings > Downloads controls the default downloads root, the folder template, the `.par2` default used by the quick filters, and the disk-space safety limits. The default folder template is `{actor_safe_name}/{record_group_id}`, which produces actor folders under the downloads root.

Downloads run as background jobs. The UI polls job status and displays captured MEGAcmd output for active jobs. Completed download details also expose persisted MEGAcmd output when a log file is available.

Download output logs are written under:

```text
config/logs/downloads/download_<download_id>.log
```
