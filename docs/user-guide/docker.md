# Docker Deployment

The production Docker image builds the React frontend, serves it from the FastAPI backend, and installs the official Debian 12 MEGAcmd package.

You can run the published image or build the image from a clone of this repository. Both use the same service name, port, and host directories, so every section after the two start options applies to either.

## Run The Published Image

Each release publishes the image to Docker Hub and the GitHub Container Registry:

- `yexca/recordtree-downloader-sqlite`
- `ghcr.io/yexca/recordtree-downloader-sqlite`

| Tag | Points to |
| --- | --- |
| `X.Y.Z`, for example `0.1.0` | That exact release |
| `X.Y`, for example `0.1` | The newest patch release of that minor version |
| `latest` | The newest release |

Pin a version tag so that an update happens only when you change the tag. The image is built for `linux/amd64` only, because it installs the amd64 MEGAcmd package.

Create an empty directory and save this file in it as `compose.yaml`:

```yaml
services:
  recordtree-web:
    image: yexca/recordtree-downloader-sqlite:0.1.0
    container_name: recordtree-web
    ports:
      - "7647:7647"
    environment:
      TZ: Asia/Tokyo
    volumes:
      - ./config:/app/config
      - ./downloads:/app/downloads
      - ./logs:/app/logs
      - ./files:/app/files
      - ./env/megacmd-home:/root
    restart: unless-stopped
```

Set `TZ` to your own time zone. Then start it from that directory:

```bash
docker compose pull
docker compose up -d
```

To update, change the tag in `compose.yaml` and run both commands again. The host directories keep your data across the update.

## Build From Source

From a clone of this repository, the bundled `docker-compose.yml` builds the image locally:

```bash
docker compose build
docker compose up -d
```

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
- `./env/megacmd-home:/root` (MEGAcmd login state)

Runtime data and the MEGAcmd login survive container recreation because these paths live on the host. Download output logs are stored under `./logs/downloads/`.

## Useful Commands

```bash
docker compose logs -f recordtree-web
docker compose exec recordtree-web recordtree stats
docker compose exec recordtree-web recordtree import /app/files/example.json
docker compose down
```
