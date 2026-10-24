# Docker WebUI Runtime Guide

This guide covers building the production Docker image from `Dockerfile` in a clone of this repository. The image builds the React frontend, serves the built assets from FastAPI, and installs the official Debian 12 MEGAcmd package so download workflows use the same `mega-*` commands expected by the CLI.

For the bind-mounted development/test container, use [Development test container](test-container.md) instead.

## Build

```bash
make docker-build
```

The image is tagged `recordtree:dev`. Pass `DOCKER_IMAGE=...` to use another tag.

## Run The Local Build

The repository's `docker-compose.yml` runs the image named by `RECORDTREE_IMAGE`. Point it at the local build by adding a `.env` file in the repository root:

```text
RECORDTREE_IMAGE=recordtree:dev
```

Then start it:

```bash
docker compose up -d
```

Initialization, MEGA login, persistent data, and day-to-day commands are the same as for the published image; see [Docker deployment](../user-guide/docker.md).
