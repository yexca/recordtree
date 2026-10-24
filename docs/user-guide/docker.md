# Docker Deployment

The Docker image builds the React frontend, serves it from the FastAPI backend, and installs the official Debian 12 MEGAcmd package.

## Images

Each release publishes the image to Docker Hub and the GitHub Container Registry:

- `yexca/recordtree`
- `ghcr.io/yexca/recordtree`

| Tag | Points to |
| --- | --- |
| `X.Y.Z`, for example `0.1.0` | That exact release |
| `X.Y`, for example `0.1` | The newest patch release of that minor version |
| `latest` | The newest release |

The image is built for `linux/amd64` only, because it installs the amd64 MEGAcmd package.

## Start

Create an empty directory and download [`docker-compose.yml`](../../docker-compose.yml) into it:

```bash
curl -fsSLO https://raw.githubusercontent.com/yexca/recordtree/main/docker-compose.yml
```

Edit `TZ` in the file to your own time zone, then start the service from that directory:

```bash
docker compose pull
docker compose up -d
```

## Choose The Image

The file runs `yexca/recordtree:latest` unless the `RECORDTREE_IMAGE` variable names another image. To pin a release, so that an update happens only when you change the tag, put the variable in a `.env` file next to `docker-compose.yml`:

```text
RECORDTREE_IMAGE=yexca/recordtree:0.1.0
```

To update, change the tag (or keep `latest`) and run `docker compose pull` and `docker compose up -d` again. The host directories keep your data across the update.

## Open The WebUI

```text
http://127.0.0.1:7647
```

## Initialize Runtime Data

```bash
docker compose exec recordtree-web recordtree init
docker compose exec recordtree-web recordtree doctor
```

## MEGA Login

MEGA credentials are managed by MEGAcmd, not by RecordTree. You can log in from the WebUI Settings page or from the container shell.

```bash
docker compose exec recordtree-web mega-login
docker compose exec recordtree-web recordtree doctor
```

MEGAcmd keeps its state in `./config/mega`. The directory fills with MEGAcmd's own files as soon as its server starts. After a login it also holds the session, which gives access to the MEGA account without the password, so protect `./config` like a credential. `mega-logout` ends the session and removes it.

## Persistent Data

The Compose file mounts these host directories:

- `./config:/app/config`: config, SQLite database, and logs
- `./config/mega:/root/.megaCmd`: MEGAcmd state and login session
- `./downloads:/app/downloads`: downloaded files
- `./cache:/app/cache`: WebUI uploads and other files to import

Runtime data and the MEGAcmd login survive container recreation because these paths live on the host. The layout inside `config/` and `cache/` follows [Default runtime paths](cli.md#initialize).

## Import From The Shell

The container only sees mounted paths. To import with the CLI, put the file in `./cache` on the host and pass its container path:

```bash
docker compose exec recordtree-web recordtree import /app/cache/example.xlsx
```

## Useful Commands

```bash
docker compose logs -f recordtree-web
docker compose exec recordtree-web recordtree stats
docker compose down
```
