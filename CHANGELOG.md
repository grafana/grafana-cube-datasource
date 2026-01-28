# Changelog

## 0.1.1 (2026-01-28)

### Fixed

- Compressed query editor screenshot to resolve webpack asset size warning
- Updated release workflow to use Node 24, matching `package.json` engine requirements

## 0.1.0 (2026-01-27)

Initial public release.

### Features

- **Query Builder**: Visual interface for building Cube queries with dimensions, measures, and filters
- **Order By**: Configurable sorting for query results
- **SQL Preview**: View the generated SQL before executing queries
- **Multi-value Filters**: Filter operators support multiple values with intuitive multi-select UI
- **Time-series Support**: Compatible with Grafana time-series panels and time range filtering
- **AdHoc Filters**: Support for Grafana's ad-hoc filter variables

### Notes

This is an experimental data source plugin. Breaking changes may occur in minor version updates until v1.0.0.
