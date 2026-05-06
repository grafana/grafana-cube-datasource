# Changelog

## [0.6.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.5.0...v0.6.0) (2026-05-06)


### ⚠ BREAKING CHANGES

* remove legacy order object format and cubeApiUrl jsonData field ([#318](https://github.com/grafana/grafana-cube-datasource/issues/318))

### Features

* remove legacy order object format and cubeApiUrl jsonData field ([#318](https://github.com/grafana/grafana-cube-datasource/issues/318)) ([0e02222](https://github.com/grafana/grafana-cube-datasource/commit/0e02222a37ad75f5e1f5718aba3e66ecd1cbe40e))


### Bug Fixes

* **deps:** update all non-major dependencies ([#311](https://github.com/grafana/grafana-cube-datasource/issues/311)) ([906040c](https://github.com/grafana/grafana-cube-datasource/commit/906040c375e6b4455d71f9623208ee7a730842dd))
* **deps:** update all non-major dependencies to v5.100.6 ([#308](https://github.com/grafana/grafana-cube-datasource/issues/308)) ([ea15a8a](https://github.com/grafana/grafana-cube-datasource/commit/ea15a8a9dc3f012d26119fa6567e988e36945b1e))
* **deps:** update grafana monorepo to v13 ([#284](https://github.com/grafana/grafana-cube-datasource/issues/284)) ([35f1614](https://github.com/grafana/grafana-cube-datasource/commit/35f16141edd3e20cc278a3201781cff1d38b7e9a))
* **deps:** update grafana monorepo to v13 ([#317](https://github.com/grafana/grafana-cube-datasource/issues/317)) ([df018ac](https://github.com/grafana/grafana-cube-datasource/commit/df018ac78c1f02f41882f413002c0d942e0e5d0d))

## 0.5.0 (2026-05-01)

### Features

- **View-scoped visual queries**: The visual query builder now scopes to one Cube view at a time, treating views as the curated public query surface. Fields from other views are disabled with guidance to model cross-view combinations as a new view. The `/metadata` resource now exposes only view members (#304)

**Full Changelog**: [v0.4.0...v0.5.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.4.0...v0.5.0)

## 0.4.0 (2026-03-27)

### Features

- **Measure/dimension descriptions in dropdowns**: Surface Cube field descriptions as subtitle text in the query editor's Dimensions and Measures dropdowns, with search matching against descriptions too (#235)
- **Data Model tab hint after Save & Test**: Always show the Data Model configuration tab hint after a successful connection test, so new users discover model generation immediately (#189)

**Full Changelog**: [v0.3.3...v0.4.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.3.3...v0.4.0)

## 0.3.3 (2026-03-20)

### Bug Fixes

- **Fix release build**: Remove Go source files shipped inside the `flatted` npm package (`golang/pkg/flatted/flatted.go`) via a `postinstall` script, preventing the Grafana plugin validator from rejecting the archive with "Invalid Go manifest file" (#2700)

**Full Changelog**: [v0.3.2...v0.3.3](https://github.com/grafana/grafana-cube-datasource/compare/v0.3.2...v0.3.3)

## 0.3.2 (2026-03-20)

### Security

- **Backend authorization for generate-schema**: The mutating `generate-schema` CallResource route now requires Admin org role, preventing non-admin users from triggering model file generation on the upstream Cube instance (#216)
- **Dependency security fixes**: Update `flatted` to 3.4.2 to resolve CVE-2026-32141 and CVE-2026-33228

### Improved

- **Standard SQL casts**: Replace PostgreSQL-specific `::date` and `::numeric` cast syntax with standard `CAST()` in demo dashboard queries and Cube model, improving compatibility with DuckDB and BigQuery (#204)

**Full Changelog**: [v0.3.0...v0.3.2](https://github.com/grafana/grafana-cube-datasource/compare/v0.3.0...v0.3.2)

## 0.3.0 (2026-03-13)

### Features

- **Standard datasource URL**: Use Grafana's standard `url` field for the Cube API endpoint instead of `jsonData.cubeApiUrl`, with backward-compatible fallback (#177)
- **Generated data model dashboard**: Added a provisioned demo dashboard for the generated data model (#175)
- **Refreshed demo dashboards**: Updated provisioned demo dashboards to reflect current plugin capabilities (#184)

### Bug Fixes

- **Stale SQL preview**: SQL preview now refreshes when dashboard variables change (#150)

### Deprecated

- **`jsonData.cubeApiUrl` provisioning field**: The URL should now be set using
  Grafana's standard top-level `url` field. The legacy `jsonData.cubeApiUrl`
  field continues to work as a fallback but will be removed in a future release.

  Migrate provisioning configs:
  ```diff
    datasources:
      - name: Cube
        type: grafana-cube-datasource
  +     url: http://localhost:4000
        jsonData:
  -       cubeApiUrl: http://localhost:4000
  +       # cubeApiUrl is no longer needed for the URL
  ```

**Full Changelog**: [v0.2.0...v0.3.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.2.0...v0.3.0)

## 0.2.0 (2026-02-18)

### Features

- **Data Model config page**: Full config page for generating Cube data model YAML files from connected database schemas (#132)
- **JSON query viewer**: When a query contains features the visual editor cannot represent (e.g. time dimensions), the query editor switches to a read-only JSON viewer with syntax highlighting and a compiled SQL preview (#136)
- **All Cube filter operators**: Support all Cube filter operators (`contains`, `gt`, `gte`, `lt`, `lte`, `set`, `notSet`, `inDateRange`, and more) and measure filters via panel JSON (#138)
- **AND/OR filter groups**: Support logical AND/OR filter groups for complex conditions via panel JSON (#139)
- **Template variable detection in filters**: Filter values containing template variables automatically trigger the JSON viewer to avoid corrupting the variable syntax (#140)
- **No-cubes guidance**: When no cubes are detected, the query editor guides users to the Data Model configuration tab (#148)

### Bug Fixes

- **Preserve limit zero and legacy template vars**: Correctly handle `limit: 0` (unlimited) and detect legacy `$variable` template variable syntax (#143)

**Full Changelog**: [v0.1.4...v0.2.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.1.4...v0.2.0)

## 0.1.4 (2026-02-13)

### Changed in 0.1.4

- Set minimum supported Grafana version to `12.2.5` based on patched Grafana plugin backward-compatibility support for jsx-runtime externalization.
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
