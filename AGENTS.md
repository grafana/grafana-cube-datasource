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

### Cube SDK parity policy (read before changing Cube API behavior)

This backend is Go, but Cube's protocol semantics are defined by the JavaScript
SDK (`@cubejs-client/core`) and the server (`@cubejs-api-gateway`). **Mirror the
SDK by default.** The full policy and the log of intentional divergences live in
[`docs/sdk-parity.md`](docs/sdk-parity.md); the agent-facing rule is
[`.cursor/rules/sdk-parity.mdc`](.cursor/rules/sdk-parity.mdc). Tracked by issue #118.

When touching `/v1/load` handling, retries, timeout/cancellation, status/error
mapping, method selection, or progress fields, you **must**:

1. Check all three sources of truth (the Cube monorepo is cloned at `../cube`):
   - JS client: `../cube/packages/cubejs-client-core/src/index.ts` and `.../HttpTransport.ts`
   - Server contract: `../cube/packages/cubejs-api-gateway/src/gateway.ts`
   - REST docs: `../cube/docs/content/product/apis-integrations/core-data-apis/rest-api/`
2. Mirror the SDK by default; only diverge for a clear Grafana/backend reason.
3. For any intentional divergence, document rationale + user impact + tests in the
   divergence log in `docs/sdk-parity.md`.
4. State the parity decision (mirror or divergence) in the PR description.

### Non-obvious notes

- Playwright E2E tests (`npm run e2e`) require services to be up first. Use `--reporter=list` to avoid the interactive HTML report blocking the terminal.
- `mage -v` builds all 6 platform binaries by default. For faster local dev, build only the Linux binary matching your Docker host architecture:
  - **Apple Silicon (M1/M2/M3/M4):** `mage -v build:linuxARM64` — Docker runs ARM64 containers natively, so Grafana loads `gpx_cube_linux_arm64`.
  - **Intel Mac / Linux x86_64:** `mage -v build:linux` — builds `gpx_cube_linux_amd64`.
  - Using the wrong architecture target means Grafana loads a stale binary and your changes won't take effect.
