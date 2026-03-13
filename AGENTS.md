# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is the **Cube Datasource Plugin for Grafana** — a Grafana plugin with a TypeScript/React frontend and a Go backend. It connects Grafana to [Cube](https://cube.dev/) for semantic-layer analytics.

### Services

| Service | Port | Purpose |
|---------|------|---------|
| Grafana | 3000 | Hosts the plugin, serves UI |
| Cube | 4000 | Semantic layer REST API |
| PostgreSQL | 5432 | Database for Cube (JaffleShop sample data) |

All three services run via `docker compose up --build` from the repo root. Grafana is provisioned with the Cube datasource, a PostgreSQL datasource, and sample dashboards automatically.

### Running services

- **Docker daemon**: Must be started before `docker compose`. Run `sudo dockerd &` if not already running (check with `docker info`).
- **Docker socket permissions**: If you get permission errors, run `sudo chmod 666 /var/run/docker.sock`.
- **Start all services**: `docker compose up --build -d` (from repo root). For dev with auto-reload, use `DEVELOPMENT=true docker compose up --build`.
- **Frontend dev server**: `npm run dev` (in a separate terminal for hot-reload).
- **Grafana access**: http://localhost:3000 — anonymous auth is enabled with Admin role (no login needed).

### Build commands

See `package.json` scripts and README for the full list. Key commands:

- Frontend build: `npm run build`
- Backend build: `mage -v` (builds all platforms; `mage -v build:linux` for Linux only)
- Lint: `npm run lint`
- Frontend tests: `npm run test:ci`
- Backend tests: `go test ./...`
- E2E tests: `npm run e2e` (requires services running via `npm run server` first)

### Gotchas

- **Node.js 24** is required (`.nvmrc`). Use `nvm use 24` if nvm is available.
- **mage** (Go build tool) must be on PATH. It installs to `$GOBIN` or `$HOME/go/bin`.
- Docker-in-Docker requires `fuse-overlayfs` storage driver and `iptables-legacy`. See the daemon config at `/etc/docker/daemon.json`.
- The `dist/` directory is volume-mounted into the Grafana container. Both frontend (`npm run build`) and backend (`mage -v`) must be built before starting docker compose, or the plugin won't load.
- Playwright E2E tests (`npm run e2e`) require the services to be running first (`npm run server` or `docker compose up --build`). Use `--reporter=list` to avoid the interactive HTML report.
