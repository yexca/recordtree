# Docker Deployment

The production Docker image builds the React frontend, serves it from the FastAPI backend, and installs the official Debian 12 MEGAcmd package.

## Build And Start

```bash
docker compose build
docker compose up -d
```

Open:

```text
http://127.0.0.1:7647
```

## Initialize Runtime Data

```bash
docker compose exec recordtree-web recordtree init
docker compose exec recordtree-web recordtree doctor
```

## MEGA Login

MEGA credentials are managed by MEGAcmd, not by RecordTreeDownloader SQLite. You can log in from the WebUI Settings page or from the container shell.

```bash
docker compose exec recordtree-web mega-login
docker compose exec recordtree-web recordtree doctor
```

The host directory `./env/megacmd-home` is mounted at `/root` and stores MEGAcmd login state.

## Persistent Data

The Compose file mounts these host directories:

- `./config:/app/config` (config and SQLite database)
- `./downloads:/app/downloads`
- `./logs:/app/logs`
- `./files:/app/files`

Runtime data survives container recreation because these paths live on the host. MEGAcmd login state survives through `./env/megacmd-home`. Download output logs are stored under `./logs/downloads/`.

Earlier versions stored the config and database under `./env/`. The local CLI and WebUI move `env/config.toml` and `env/recordtree.sqlite3` into `config/` automatically on first start. Docker no longer mounts `./env` into the container, so for Docker-only setups move both files into `./config/` yourself and set `database = "config/recordtree.sqlite3"` in `config/config.toml`.

## Useful Commands

```bash
docker compose logs -f recordtree-web
docker compose exec recordtree-web recordtree stats
docker compose exec recordtree-web recordtree import /app/files/example.json
docker compose down
```
