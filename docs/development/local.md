# Local Development

Python dependencies are managed with uv. `pyproject.toml` declares them, `uv.lock` pins every version, and `.python-version` pins the Python version, which uv installs when it is missing.

Create `.venv` with the project and the `dev` dependency group, which also holds the web extra's packages:

```bash
uv sync
```

Run tests:

```bash
uv run pytest
```

After changing dependencies in `pyproject.toml`, update the lock and commit `uv.lock` with the change:

```bash
uv lock
```

Start the FastAPI backend:

```bash
uv run uvicorn recordtree.web.api:app --host 127.0.0.1 --port 7647
```

Start the Vite frontend in another terminal:

```bash
cd web
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://127.0.0.1:5173
```

The Vite dev server proxies `/api` requests to the backend.
