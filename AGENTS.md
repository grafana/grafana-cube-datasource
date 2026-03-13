# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Cube Datasource Plugin for Grafana — TypeScript/React frontend + Go backend. Connects Grafana to [Cube](https://cube.dev/) for semantic-layer analytics. See `README.md` for full development docs and all build/test/lint commands.

### Services

Three services run via `docker compose up --build -d` from the repo root:

| Service | Port | Purpose |
|---------|------|---------|
| Grafana | 3000 | Hosts the plugin (anonymous Admin auth, no login needed) |
| Cube | 4000 | Semantic layer REST API |
| PostgreSQL | 5432 | Cube's backing database (JaffleShop sample data) |

### Starting services

Docker daemon must be running first: `sudo dockerd &` (then `sudo chmod 666 /var/run/docker.sock` if you get permission errors).

Both frontend (`npm run build`) and backend (`mage -v`) must be built **before** `docker compose up`, because `dist/` is volume-mounted into the Grafana container. Without it the plugin won't load.

### Non-obvious notes

- Playwright E2E tests (`npm run e2e`) require services to be up first. Use `--reporter=list` to avoid the interactive HTML report blocking the terminal.
- `mage -v` builds all 6 platform binaries by default. Use `mage -v build:linux` to build only the Linux binary (faster for local dev).
