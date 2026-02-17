# Development Environment

This directory contains the development infrastructure for running Cube and Postgres alongside the Grafana plugin during development and testing.

## Structure

- `cube/` - Cube configuration and data models
  - `model/cubes/` - Cube definitions for raw data tables
  - `model/views/` - Cube views and derived metrics
  - `package.json` - Cube project configuration
- `data/` - Database setup and sample data
  - `migrations/init.sql` - Database schema and data loading
  - `seeds/` - CSV files with sample JaffleShop data

## Usage

The docker-compose.yaml in the parent directory will automatically:

1. Start Postgres with the sample data loaded
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
