FROM ghcr.io/astral-sh/uv:0.13.5 AS uv

FROM node:24-bookworm AS frontend

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm

LABEL org.opencontainers.image.licenses="AGPL-3.0-only"

# uv builds the environment from uv.lock with the image's Python and never
# downloads another one.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_NO_CACHE=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    PATH="/app/.venv/bin:${PATH}"

COPY --from=uv /uv /usr/local/bin/uv

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ca-certificates \
    && wget -O /tmp/megacmd-Debian_12_amd64.deb https://mega.nz/linux/repo/Debian_12/amd64/megacmd-Debian_12_amd64.deb \
    && apt-get install -y --no-install-recommends /tmp/megacmd-Debian_12_amd64.deb \
    && rm -f /tmp/megacmd-Debian_12_amd64.deb \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Dependencies install before the source is copied, so a source change keeps
# their layer. The project installs editable, because the API serves web/dist
# relative to the source tree.
COPY pyproject.toml uv.lock README.md LICENSE ./
RUN uv sync --locked --no-dev --extra web --no-install-project

COPY recordtree ./recordtree
COPY --from=frontend /app/web/dist ./web/dist

RUN uv sync --locked --no-dev --extra web

RUN mkdir -p config/logs downloads cache/uploads

EXPOSE 7647

CMD ["uvicorn", "recordtree.web.api:app", "--host", "0.0.0.0", "--port", "7647"]
