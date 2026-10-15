# Development Environment

This directory contains the development infrastructure for running Cube and Postgres alongside the Grafana plugin during development and testing.

## Structure

- `cube/` - Cube configuration and data models
  - `model/cubes/` - Cube definitions for raw data tables
  - `model/views/` - Cube views and derived metrics
  - `package.json` - Cube project configuration
- `data/` - Database setup and sample data
  - `migrations/init.sql` - JaffleShop schema and data loading
  - `migrations/revops.sql` - RevOps schema and data loading
  - `seeds/` - CSV files with sample JaffleShop data
  - `seeds/revops/` - Generated RevOps CSVs, plus the generator and its tests

## Usage

The docker-compose.yaml in the parent directory will automatically:

1. Start Postgres with the sample data loaded (on first start only - see [Resetting the data](#resetting-the-data))
2. Start Cube connected to Postgres
3. Start Grafana with the plugin loaded

All services will be available at:

- Grafana: localhost:3000 (admin/admin)
- Cube API: localhost:4000
- Postgres: localhost:5432 (user/password, database: jaffle_shop)

## Sample Data

The environment includes JaffleShop sample data with:

- `customers` - Customer information
- `orders` - Order data with status and dates
- `payments` - Payment information linked to orders

This provides a complete dataset for testing the Grafana-Cube integration.

## RevOps Territory Navigator example

The RevOps dashboards we presented at GrafanaCON 2026 (previously on play.grafana.org) run against fictional sales data in the `revops` schema:

- `revops_reporting_territory_navigator_account_details` - one row per account (300)
- `revops_reporting_opp_split` - open and closed opportunities (203)
- `rpt_self_serve_territory_navigator_orgs` - Grafana Cloud orgs per account (190)

Two dashboards show the same content built two ways, and link to each other from their header:

- **GrafanaCon2026 RevOps: Semantic Layer** (http://localhost:3000/d/territory-navigator/) - Cube queries via the `territory_navigator` view, with cross-panel filtering. Click a bar or table cell and choose "Filter for" to filter every panel.
- **GrafanaCon2026 RevOps: SQL Only** (http://localhost:3000/d/territory-navigator-sql-only-version/) - the same panels written as raw PostgreSQL, filtered with dashboard variables.

The Cube models are in `cube/model/cubes/revops_*.yml` and `cube/model/views/revops_territory_navigator.yml`.

### Regenerating the data

The CSVs are generated, deterministically, by `seeds/revops/generate.py` (standard library only):

```bash
cd dev-environment/data/seeds/revops
python3 generate.py      # rewrites the CSVs next to the script
python3 -m pytest        # or: uvx pytest
```

## Resetting the data

Postgres keeps its data in the `postgres-data` volume, so the seed scripts only run on the very first start and later starts boot straight away. To reload after changing a seed or migration:

```bash
docker compose down -v
docker compose up --build
```
