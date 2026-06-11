# Intero

Clinical audit workflow prototype using OpenCode for local orchestration.

## Quick Start

```bash
python3 -m venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env
python3 -m database.scripts.build_emr_db --all
python3 -m server
# new terminal:
cd app && npm install && npm run dev
```

Open **http://localhost:5173**, pick a template, and start an audit.

## Prerequisites

- Python 3.10+
- `uv`
- Node.js 18+
- OpenCode 1.14.50+ on `PATH`

## Layout

| Path | Description | Details |
|------|-------------|---------|
| `server/` | FastAPI backend (control plane) | [`server/README.md`](./server/README.md) |
| `app/` | Svelte browser UI | [`app/README.md`](./app/README.md) |
| `database/` | CSV fixtures & SQLite builder | [`database/README.md`](./database/README.md) |
| `agent/` | OpenCode project root (execution plane) | — |
| `docs/` | MVP spec, templates, archived skills | — |
