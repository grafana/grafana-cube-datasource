# Grafana Cube Datasource

A Grafana data source plugin that connects to [Cube](https://cube.dev/), the semantic layer for building data applications. This plugin allows you to query Cube's APIs directly from Grafana to create dashboards and visualizations.

## About Cube

Cube is a semantic layer that sits between your data warehouse and your applications. It provides a consistent API for querying data, handles caching, security, and pre-aggregations. This Grafana plugin enables you to leverage Cube's powerful data modeling capabilities directly in your Grafana dashboards.

## Getting started

### Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Update [Grafana plugin SDK for Go](https://grafana.com/developers/plugin-tools/key-concepts/backend-plugins/grafana-plugin-sdk-for-go) dependency to the latest minor version:

   ```bash
   go get -u github.com/grafana/grafana-plugin-sdk-go
   go mod tidy
   ```

### Development Workflow (Recommended)

For the best development experience with automatic reloading of both frontend and backend changes:

**Terminal 1 - Frontend Development:**

```bash
npm run dev
```

**Terminal 2 - Backend Development with Auto-reload:**

```bash
DEVELOPMENT=true docker compose up --build
```

This setup provides:

- **Frontend hot-reloading**: Changes to TypeScript/React code automatically refresh the browser
- **Backend auto-rebuilding**: Changes to Go code automatically rebuild and reload the plugin
- **Built-in debugging**: Delve debugger available on port 2345

The docker-compose setup includes Cube and Postgres with sample data, starting:

- Postgres with JaffleShop sample data pre-loaded
- Cube connected to Postgres
- Grafana with the plugin loaded

Once running, you can:

1. **Access Grafana** at: http://localhost:3000

   - Login with username: `admin`, password: `admin`
   - The Cube datasource is automatically provisioned and ready to use
   - A PostgreSQL datasource is also provisioned for direct database access
   - Sample dashboards are pre-loaded for testing

2. **Test the Cube API directly** (authentication is not required):
   ```console
   curl -G --data-urlencode 'query={"dimensions":["orders.raw_customers_first_name"],"measures":["orders.raw_payments_total_amount","orders.raw_orders_count"]}' http://localhost:4000/cubejs-api/v1/load | jq '.data[0]'
   ```

### Individual Build Commands

For production builds or manual development:

**Backend builds:**

```bash
# Build for all platforms
mage -v

# Build for M4 Mac (ARM64 Linux)
mage -v build:linuxARM64

# List all available Mage targets
mage -l
```

**Frontend builds:**

```bash
# Production build
npm run build

# Alternative Docker setup (without auto-reload)
npm run server
```

**Testing:**

```bash
# Run unit tests with file watching
npm run test

# Run unit tests once (for CI)
npm run test:ci

# Run E2E tests (using Playwright)
# First, spin up a Grafana instance to test against:
npm run server
# Optionally specify Grafana version:
GRAFANA_VERSION=11.3.0 npm run server
# Then run the E2E tests:
npm run e2e
```

**Code Quality:**

```bash
# Run linter
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

## CI/CD and Distribution

This plugin uses Grafana's standardized CI/CD workflows for automated building, testing, and publishing.

## Automated Build Pipeline

The CI pipeline automatically:

- **Builds and tests** the plugin on every push and PR
- **Creates signed ZIP files** for all supported platforms
- **Uploads artifacts** to GitHub Actions and GCS storage
- **Runs E2E tests** using Playwright

### Key Developer Questions

**Q: Does the CI pipeline produce a signed plugin ZIP?**  
A: Yes, the CI automatically builds and signs ZIP files for all platforms (universal + per-architecture for the Go backend).

**Q: Where are the ZIP files uploaded?**  
A: ZIP files are uploaded to:

- GitHub Actions artifacts (for PRs and development)
- GCS storage (for release artifacts)

**Q: How can I use these ZIPs on Grafana Cloud?**  
A: For Grafana Cloud deployment, use the **"Plugins - CD"** workflow in the Actions tab to publish to dev/ops/prod environments.

## Publishing Workflow

To publish the plugin:

1. Go to **Actions** → **"Plugins - CD"** → **"Run workflow"**
2. Choose target environment: `dev`, `ops`, `prod-canary`, or `prod`
3. The workflow will build, sign, and publish automatically

### Testing Feature Branches

You can deploy any branch (not just `main`) to test changes before merging:

**Why:** This lets you test your feature in a real Grafana Cloud environment before merging to `main`, catching integration issues early.

**How:**

- Set **branch** to your feature/PR branch name (e.g., `feature/new-query-builder`)
- Set **environment** to `dev` (safe testing environment)
- Plugin version becomes `x.y.z+COMMIT_SHA` (e.g., `1.2.3+a1b2c3d4`)

**Result:** Your exact commit gets deployed to Grafana Cloud dev with a unique version identifier, allowing safe testing without affecting other developers or environments.

## For External Contributors & Open Source Community

**This section is for developers outside Grafana Labs** who want to fork this repository and distribute their own version independently.

### CI/CD for External Developers

The GitHub Actions workflows in this repository (`push.yaml` and `publish.yaml`) are designed for Grafana's internal infrastructure and **will not work** for external contributors.

If you're forking this repo, you should:

1. **Revert to the previous CI workflows** that were removed in [this PR](https://github.com/grafana/grafana-cube-datasource/pull/9) - these contain the basic build, test, and packaging logic without Grafana-specific deployment steps
2. **Use manual plugin signing** for distribution to your own Grafana instances

### Manual Plugin Signing

For private distribution or local development:

```bash
npm install -g @grafana/sign-plugin
npx @grafana/sign-plugin --rootUrls https://your-grafana-instance.com
```

This allows you to sign and distribute your fork without going through Grafana's official plugin catalog or internal infrastructure.

## Learn more

Below you can find source code for existing app plugins and other related documentation.

- [Basic data source plugin example](https://github.com/grafana/grafana-plugin-examples/tree/master/examples/datasource-basic#readme)
- [`plugin.json` documentation](https://grafana.com/developers/plugin-tools/reference/plugin-json)
- [How to sign a plugin?](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin)
