# Troubleshooting

## Useful Commands

```bash
recordtree doctor
recordtree stats
recordtree info <id>
recordtree list-undownloaded --limit 20
recordtree list-undownloaded --actor-id <actor-id>
```

## Common Issues

- Missing config or database: run `recordtree init`.
- Unsupported import extension: import the Excel export as `.xlsx` or `.xlsm`.
- Database uses an unsupported schema version: the file was written for an older workbook format. Move it aside, run `recordtree init`, and import the workbook again.
- Import row errors: check `config/logs/import_<import_id>_errors.csv`.
- MEGAcmd missing: install MEGAcmd and ensure `mega-get` and `mega-whoami` are on `PATH`, or configure executable paths in `config/config.toml`.
- Not logged in: run `mega-login`, then run `recordtree doctor`.
- Insufficient disk space: change `--output`, free space, or adjust the safety margin in `config/config.toml`.

## Backups

Before an import, back up:

- `config/recordtree.sqlite3`
- `config/recordtree.sqlite3-wal`, if present
- `config/recordtree.sqlite3-shm`, if present

You can also use the SQLite backup API.
