# Development Environment

This directory contains the development infrastructure for running Cube, DuckLake, and PostgreSQL alongside the Grafana plugin during development and testing.

## Architecture

The dev environment uses **DuckLake** — an open data lakehouse format that stores metadata in PostgreSQL and data as Parquet files. This enables concurrent access from multiple DuckDB processes (Cube, Grafana, dbt) without the single-writer file lock limitation of plain DuckDB.

```
PostgreSQL (DuckLake catalog — metadata, snapshots, ACID)
     ↕
Parquet files on shared Docker volume (actual data)
     ↕
┌───────────────────────────────────────────┐
│ ducklake-init:  seeds data via DuckLake   │
│ Cube:           reads via DuckLake        │
│ Grafana:        reads via DuckLake        │
│   (all independent DuckDB processes)      │
└───────────────────────────────────────────┘
```

## Structure

- `cube/` - Cube configuration and data models
  - `cube.js` - Driver config with `initSql` to ATTACH DuckLake catalog
  - `model/cubes/` - Cube definitions for raw data tables
  - `model/views/` - Cube views and derived metrics
- `data/` - Database setup and sample data
  - `Dockerfile` - DuckDB CLI init container
  - `migrations/init.sql` - DuckLake schema and data seeding
  - `seeds/` - CSV files with sample JaffleShop data

## Usage

The docker-compose.yaml in the parent directory will automatically:

1. Start PostgreSQL as the DuckLake catalog
2. Run the ducklake-init container to seed data (Parquet files + catalog entries)
3. Start Cube connected to DuckLake (DuckDB + ducklake extension → PostgreSQL catalog)
4. Start Grafana with the DuckDB plugin connected to DuckLake

All services will be available at:

- Grafana: localhost:3000 (anonymous Admin auth, no login needed)
- Cube API: localhost:4000

## Sample Data

The environment includes JaffleShop sample data with:

- `customers` - Customer information
- `orders` - Order data with status and dates
- `payments` - Payment information linked to orders

This provides a complete dataset for testing the Grafana-Cube integration.
