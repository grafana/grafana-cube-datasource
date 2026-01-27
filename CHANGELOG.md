# Changelog

## 3.9.0 (2026-01-27)

### Features

- **Cube type alignment**: Align timeDimensions and order typing with official `@cubejs-client/core` types (#64)
- **Compile-time type checking**: Add type checking against `@cubejs-client/core` types for improved reliability (#59)

### Refactoring

- **Type naming conventions**: Rename types for consistency with Grafana plugin conventions (#66)

### Documentation

- **User documentation**: Add comprehensive user documentation to README and plugin overview (#75)

### Housekeeping

- Removed unused dashboard variable interpolation for dimensions/measures/filters (this was never documented or functional) (#73)

**Full Changelog**: [v3.8.1...v3.9.0](https://github.com/grafana/grafana-cube-datasource/compare/v3.8.1...v3.9.0)

## 3.8.1 (2026-01-23)

### Documentation

- Rewrote changelog with complete version history

**Full Changelog**: [v3.8.0...v3.8.1](https://github.com/grafana/grafana-cube-datasource/compare/v3.8.0...v3.8.1)

## 3.8.0 (2026-01-23)

### Features

- **Array format for order-by**: Changed order-by to use array format to guarantee field ordering (#40)
- **Time-series panel support**: Added time-series panel and time-filtering dimension to example dashboard (#33)

### Infrastructure

- Configured Renovate to update Go version in workflows (#39)

### Dependencies

- Various non-major dependency updates

**Full Changelog**: [v3.7.6...v3.8.0](https://github.com/grafana/grafana-cube-datasource/compare/v3.7.6...v3.8.0)

## 3.7.6 (2026-01-21)

### Features

- **Multi-value filter support**: Filter operators now support multiple values, with improved UX for handling many selections (#25)
- **Responsive query editor**: Dimensions, Measures, and Filter value selectors now adapt to container width using CSS container queries

### Bug Fixes

- **Filter validation**: Empty-valued filters are now filtered out before sending to the Cube API, preventing errors
- **AdHoc filter compatibility**: Regex operators from Grafana AdHoc filters are mapped to equals/notEquals as a workaround
- **Relaxed filter requirements**: You can now add new filters even when existing filters are incomplete (#29)

### Infrastructure

- Fixed release workflow to use Go 1.25 (matching go.mod requirements)

### Dependencies

- Updated @tanstack/react-query to v5.90.19
- Updated eslint-plugin-jsdoc to v62.1.0
- Updated actions/checkout to v6
- Various other dependency updates

**Full Changelog**: [v3.7.4...v3.7.6](https://github.com/grafana/grafana-cube-datasource/compare/v3.7.4...v3.7.6)

## 3.7.4 (2026-01-16)

### Bug Fixes

- Updated LICENSE file
- Fixed `qs` vulnerability in dependencies (#13)

**Full Changelog**: [v3.7.3...v3.7.4](https://github.com/grafana/grafana-cube-datasource/compare/v3.7.3...v3.7.4)

## 3.7.3 (2026-01-16)

### Bug Fixes

- Fixed Go version (1.24) in release workflow (#12)

## 3.7.2 (2026-01-16)

### Infrastructure

- Added release workflow for GitHub release artifacts (#9)
- Version bump for release pipeline testing

## 3.7.1 (2026-01-16)

Initial public release.

### Features

- **Query Builder**: Visual interface for building Cube queries with dimensions, measures, and filters
- **Order By**: Configurable sorting with the OrderBy component (#189)
- **Filtering**: Basic filtering ability in the query editor UI (#218)
- **SQL Preview**: View the generated SQL before executing queries
- **AdHoc Filters**: Support for Grafana's ad-hoc filter variables
