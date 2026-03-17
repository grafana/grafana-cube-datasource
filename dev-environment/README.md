# Development Environment

This directory contains the development infrastructure for running Cube and DuckDB alongside the Grafana plugin during development and testing. DuckDB is configured as the data source, providing BigQuery-compatible SQL semantics.

## Structure

- `cube/` - Cube configuration and data models
  - `model/cubes/` - Cube definitions for raw data tables
  - `model/views/` - Cube views and derived metrics
  - `package.json` - Cube project configuration
- `data/` - Database setup and sample data
  - `Dockerfile` - DuckDB CLI init container
  - `migrations/init.sql` - Database schema and data loading (DuckDB SQL)
  - `seeds/` - CSV files with sample JaffleShop data

## Usage

The docker-compose.yaml in the parent directory will automatically:

1. Build a DuckDB init container to create and seed the database
2. Start Cube connected to the DuckDB database file
3. Start Grafana with both the Cube plugin and the DuckDB datasource plugin loaded

All services will be available at:

- Grafana: localhost:3000 (anonymous Admin auth, no login needed)
- Cube API: localhost:4000

## Sample Data

The environment includes JaffleShop sample data with:

- `customers` - Customer information
- `orders` - Order data with status and dates
- `payments` - Payment information linked to orders

This provides a complete dataset for testing the Grafana-Cube integration.
