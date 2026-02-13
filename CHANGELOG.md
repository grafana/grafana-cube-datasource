# Changelog

## 0.1.4 (2026-02-13)

### Changed in 0.1.4

- Set supported Grafana range to `>=12.2.5 <12.3 || >=12.3.0` based on patched Grafana plugin backward-compatibility support for jsx-runtime externalization.
- Drop support for Grafana versions earlier than `12.2.5`.
- Use `12.3.3` as the default local development target while keeping `12.2.5` as the minimum supported version.

## 0.1.3 (2026-02-12)

### Fixed in 0.1.3

- Externalize `react/jsx-runtime` and `react/jsx-dev-runtime` to keep frontend bundle behavior compatible with React 19
- Remove invalid alerting receiver from local provisioning to unblock React 19 preview startup during validation

### Changed in 0.1.3

- Upgrade shared `plugin-ci-workflows` to `v6.0.0` so React 19 preview checks are included in CI by default

## 0.1.2 (2026-02-12)

### Fixed in 0.1.2

- Handle Cube "Continue wait" polling protocol correctly for long-running queries
- Update non-major dependencies, including security-related updates

### Changed in 0.1.2

- Simplify backend test interaction patterns for better maintainability

### Documentation in 0.1.2

- Add Cube SDK parity guidance for backend protocol behavior

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
