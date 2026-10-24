# Agent Guide

Read these first:

- `README.md`
- `docs/maintainer-guide/architecture.md`
- `docs/maintainer-guide/data-contract.md`

Before changing an area, read its docs:

| Area | Docs |
| --- | --- |
| Layers, services, MEGAcmd boundary | `docs/maintainer-guide/architecture.md` |
| Import inputs, identity, link and status rules | `docs/maintainer-guide/data-contract.md` |
| Tests and fixtures | `docs/maintainer-guide/testing.md` |
| Local setup and the WebUI dev server | `docs/development/local.md` |
| Docker images and Compose | `docs/development/docker.md`, `docs/user-guide/docker.md` |
| User-facing CLI and WebUI behavior | `docs/user-guide/` |

## Product Boundaries

- Dependencies point inward: CLI (`recordtree/cli.py`) and the WebUI API
  (`recordtree/web/`) call the application service layer
  (`recordtree/app.py`), which calls importers, domain helpers, repositories,
  and infrastructure. Do not call persistence or subprocess code directly from
  the CLI or an API route.
- The application never stores MEGA credentials. Login state comes from
  `mega-whoami`; downloads run `mega-get` only after preflight checks pass.
- Every MEGAcmd call goes through `recordtree/mega.py` with a list of
  arguments and `shell=False`. Never build a shell command string from record
  data, paths, or links.
- Download status is authoritative at the link level. Record-level labels
  (`all`, `partial`, `none`, `unknown`) are derived from active links and are
  never stored as a separate truth.
- The Record Tree Excel export is the only import source, and each import
  syncs the database to it. Do not change how an import matches rows to
  record groups and links (URL ownership, `source_key` composition) without
  discussing it first, since that decides whether a re-import keeps group ids
  and download status.
- Users keep a real database in `config/recordtree.sqlite3`. A schema change
  must upgrade an existing database in place: extend `recordtree/schema.sql`
  for fresh databases, add an idempotent step to `_migrate_schema` in
  `recordtree/db.py` for existing ones, and raise `SCHEMA_VERSION` while
  leaving `OLDEST_SUPPORTED_SCHEMA_VERSION` alone. Never require a re-import
  or a fresh database.

## Frontend

- The WebUI lives in `web/` (React, Mantine, Vite) and talks to the API only
  through `web/src/api/client.ts`.
- Use the theme tokens in `web/src/theme.ts` and `web/src/styles.css` instead
  of literal colors; status color communicates download state, not source.
- Contain page failures with the existing error boundary so one failed
  request does not discard the rest of the page.

## Tests

- Tests protect a user-visible behavior, a public contract, a state
  transition, or a prior regression. Choose the lowest sufficient layer.
- Fixtures are small and synthetic, built under `tmp_path`. Never use or
  commit a real export, database, or MEGA link.
- MEGAcmd tests use mocks; no test may need network access, a MEGA account,
  or a real `mega-get`.
- Write a MEGA link in a test or doc only with placeholder parts, such as
  `https://mega.nz/file/<id>#<key>`. `make sensitive-check` reports a link
  whose node id or decryption key looks real.

## Documentation

Docs describe the current system, not how it got there.

- Write in present tense. Do not narrate change ("previously", "no longer",
  "now", "was removed") or reference PRs, issues, or commits.
- When behavior changes, rewrite the affected section as if it had always
  been this way, and remove every statement the change contradicts.
- State each rule in one place and link to it instead of restating it.
- `README.md` and `README.zh-CN.md` change together. If a passage cannot be
  translated, remove it from the translation rather than leave it stale.
- `docs/development/cli-design/` is the original design record; do not update
  it to match later behavior.

## Validation Commands

The `Makefile` is the canonical entry point for validation, and GitHub Actions
runs the same targets. Prefer a target over reconstructing its command.

| Change | Target |
| --- | --- |
| Python code | `make python-lint python-test` |
| WebUI | `make web-build` (runs `tsc -b`, so it is the type check) |
| `scripts/` or `.github/` | `make ci-style` |
| `Dockerfile`, `.dockerignore`, runtime layout | `make docker-build` |
| Everything Actions runs | `make ci` |

- Python environments are managed with uv. Run `make python-install` once to
  build `.venv` from `uv.lock`; the Python targets run through `uv run
  --locked`, so they fail when `uv.lock` is out of date. After changing
  dependencies in `pyproject.toml`, run `uv lock` and commit `uv.lock`.
- Keep validation proportional to the change.
- Redirect the output of slow targets to a log file outside tracked paths and
  read that file instead of re-running the target to see another part.

## Sensitive Data Check

This repository is public, and its data is a personal library. Before every
commit, run `make sensitive-check` and review each finding. It scans the
working-tree diff against `HEAD` plus untracked files for:

- MEGA links with a real node id or decryption key, in any link form;
- credentials, tokens, and literal values assigned to sensitive keys;
- private local paths under a Windows user profile or a home directory;
- non-reserved service URLs and non-loopback IPv4 addresses;
- files that `.gitignore` matches (databases, `config/`, `downloads/`,
  `cache/`, and other runtime data), and binary files such as Excel exports.

Use reserved domains (`example.com`, `.test`, `.invalid`) and obviously
synthetic names in examples. A public URL the code or images really need goes
in `scripts/privacy-allowlist.json` with its owner files and a reason; review
every change to that list. Do not bypass the scan with comments. The check is
deliberately not part of CI, because it must run before the data is committed.

## Commits and Handoff

- Commit messages use `<type>(scope): <description>`, for example
  `feat(webui): add download filters` or `fix(import): keep link order`.
- Commits are signed through the configured SSH signer. If signing needs
  approval or fails, stop and ask; never disable signing or pass a no-sign
  flag.
- A release is a `vX.Y.Z` tag whose version matches `version` in
  `pyproject.toml`, on a `main` commit with a passing Full run. The Release
  workflow then publishes the image to Docker Hub and GHCR and creates the
  GitHub Release.
- Do not push, tag, open or update a pull request, or post on issues without
  the user's explicit approval for that action. Draft the text first.
- Do not invent identifiers. Versions, tags, issue and PR numbers come from
  the repository or the user. Reference functions, files, and make targets by
  name, not by line number.
- Before handoff, run the smallest sufficient targets above, then
  `make sensitive-check`.
