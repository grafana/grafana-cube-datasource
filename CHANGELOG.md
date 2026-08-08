# Changelog

## [0.6.4](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.3...v0.6.4) (2026-08-08)


### Bug Fixes

* **adhoc:** drop AdHoc filters inapplicable to a query's Cube view ([#307](https://github.com/grafana/grafana-cube-datasource/issues/307)) ([#495](https://github.com/grafana/grafana-cube-datasource/issues/495)) ([dc4130d](https://github.com/grafana/grafana-cube-datasource/commit/dc4130dabc5e453d10d521f0f618966f6868d20c))
* **adhoc:** partition getTagValues scoping filters + time dimension by view ([#498](https://github.com/grafana/grafana-cube-datasource/issues/498)) ([#499](https://github.com/grafana/grafana-cube-datasource/issues/499)) ([fe0ba7e](https://github.com/grafana/grafana-cube-datasource/commit/fe0ba7ec854062073952b9c1e26cac985ede27d6))
* **adhoc:** wire AdHoc filters via request.filters ([#127](https://github.com/grafana/grafana-cube-datasource/issues/127)) + [#307](https://github.com/grafana/grafana-cube-datasource/issues/307) demo ([#507](https://github.com/grafana/grafana-cube-datasource/issues/507)) ([c45b7f3](https://github.com/grafana/grafana-cube-datasource/commit/c45b7f3ec01ff333e999e4e994792b6e42928dbb))
* **deps:** bump fast-uri to 3.1.5 to fix CVE-2026-18446 ([#535](https://github.com/grafana/grafana-cube-datasource/issues/535)) ([62151c5](https://github.com/grafana/grafana-cube-datasource/commit/62151c54dd68cf870f1633e81a494a0e570584a5))
* **deps:** update grafana monorepo to v13.1.2 ([#544](https://github.com/grafana/grafana-cube-datasource/issues/544)) ([f53ba8f](https://github.com/grafana/grafana-cube-datasource/commit/f53ba8f4e87f5320b23aa4c56cfa37ae7975079e))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.295.0 ([#529](https://github.com/grafana/grafana-cube-datasource/issues/529)) ([a5adc40](https://github.com/grafana/grafana-cube-datasource/commit/a5adc40a6d4322f127e3411b9f4cf5725b2825bd))

## [0.6.3](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.2...v0.6.3) (2026-07-27)


### Features

* **format:** support Cube measure format → Grafana units ([#246](https://github.com/grafana/grafana-cube-datasource/issues/246)) ([#459](https://github.com/grafana/grafana-cube-datasource/issues/459)) ([2185fde](https://github.com/grafana/grafana-cube-datasource/commit/2185fde38ecc7c616f3003165525c30ab004c10a))


### Bug Fixes

* **adhoc:** scope filter values by dashboard time range ($cubeTimeDimension) ([#35](https://github.com/grafana/grafana-cube-datasource/issues/35)) ([#454](https://github.com/grafana/grafana-cube-datasource/issues/454)) ([84a3613](https://github.com/grafana/grafana-cube-datasource/commit/84a3613b58aeaa3366a402f175e177bb6743f423))
* **backend:** preserve upstream /v1/load status + transient retry & transport classification ([#118](https://github.com/grafana/grafana-cube-datasource/issues/118)) ([#431](https://github.com/grafana/grafana-cube-datasource/issues/431)) ([c51844b](https://github.com/grafana/grafana-cube-datasource/commit/c51844b7620d3315e500379b80449a83b19e19f2))
* **deps:** force brace-expansion 5.0.8 via minimatch 10 override (GHSA-mh99-v99m-4gvg) ([#476](https://github.com/grafana/grafana-cube-datasource/issues/476)) ([f52495c](https://github.com/grafana/grafana-cube-datasource/commit/f52495cc4b60e1fcac22f5b874add6b7fa285137))
* **deps:** update dependency @grafana/plugin-ui to v0.17.1 ([#413](https://github.com/grafana/grafana-cube-datasource/issues/413)) ([5529e5d](https://github.com/grafana/grafana-cube-datasource/commit/5529e5dd56d98cc3c6b7b2e91e4b9554372f69ab))
* **deps:** update dependency @grafana/plugin-ui to v0.17.2 ([#451](https://github.com/grafana/grafana-cube-datasource/issues/451)) ([971cf18](https://github.com/grafana/grafana-cube-datasource/commit/971cf18b16e9101484f1deece99754c394dc5b71))
* **deps:** update dependency @grafana/plugin-ui to v0.17.3 ([#456](https://github.com/grafana/grafana-cube-datasource/issues/456)) ([1283a59](https://github.com/grafana/grafana-cube-datasource/commit/1283a59d62769e9ea97cc226fce56591ab74bd2c))
* **deps:** update fast-uri to 3.1.4 (CVE-2026-16221) ([#410](https://github.com/grafana/grafana-cube-datasource/issues/410)) ([1052d46](https://github.com/grafana/grafana-cube-datasource/commit/1052d46ba9b4c45af534de6299c93e0d13c373a7))
* **deps:** update fast-uri to patched 3.1.3 (CVE-2026-13676) ([#406](https://github.com/grafana/grafana-cube-datasource/issues/406)) ([6bdb84c](https://github.com/grafana/grafana-cube-datasource/commit/6bdb84cc4f5eabb17f3aff9be7bfdcd8f8361ca5))
* **deps:** update grafana monorepo to v13.1.0 ([#414](https://github.com/grafana/grafana-cube-datasource/issues/414)) ([ab8e5ec](https://github.com/grafana/grafana-cube-datasource/commit/ab8e5ecbc4a877dabf87261a110cb9543c30558f))
* **deps:** update grafana monorepo to v13.1.1 ([#448](https://github.com/grafana/grafana-cube-datasource/issues/448)) ([47230b9](https://github.com/grafana/grafana-cube-datasource/commit/47230b92706d77cb054701e2c901357167b248e7))
* **deps:** update js-yaml to patched 4.3.0/3.15.0 (CVE-2026-59869) ([#383](https://github.com/grafana/grafana-cube-datasource/issues/383)) ([a792b10](https://github.com/grafana/grafana-cube-datasource/commit/a792b10aedc0d26567897d0190f6ec0420a7777d))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.292.1 ([#376](https://github.com/grafana/grafana-cube-datasource/issues/376)) ([77902b6](https://github.com/grafana/grafana-cube-datasource/commit/77902b6c537558455ad2fc9e3559086c203fa61b))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.294.0 ([#435](https://github.com/grafana/grafana-cube-datasource/issues/435)) ([dac5152](https://github.com/grafana/grafana-cube-datasource/commit/dac51520281e727645d959754767d0598db09580))
* **deps:** update postcss to patched 8.5.18+ (GHSA-r28c-9q8g-f849) ([#452](https://github.com/grafana/grafana-cube-datasource/issues/452)) ([40afaa8](https://github.com/grafana/grafana-cube-datasource/commit/40afaa8decf8d423124bf6034ffd53c10bbc72cf))
* **deps:** update tanstack-query monorepo to v5.101.2 ([#415](https://github.com/grafana/grafana-cube-datasource/issues/415)) ([c3ec237](https://github.com/grafana/grafana-cube-datasource/commit/c3ec2377e2e8441d9365777e07c57f5a58ed559a))
* **deps:** update tanstack-query monorepo to v5.101.3 ([#437](https://github.com/grafana/grafana-cube-datasource/issues/437)) ([1af9098](https://github.com/grafana/grafana-cube-datasource/commit/1af90988b9bd945378247926c38137387c07efc8))
* **deps:** update tanstack-query monorepo to v5.101.4 ([#449](https://github.com/grafana/grafana-cube-datasource/issues/449)) ([e08f2ee](https://github.com/grafana/grafana-cube-datasource/commit/e08f2eebdc932141e35191a907506cee1b0625e6))
* fall back to POST /v1/load for large queries ([#379](https://github.com/grafana/grafana-cube-datasource/issues/379)) ([7edf7cf](https://github.com/grafana/grafana-cube-datasource/commit/7edf7cf8bcbd02c46bd7c0697f7c35b8771bea89))
* **plugin:** make grafanaDependency prerelease-inclusive ([#362](https://github.com/grafana/grafana-cube-datasource/issues/362)) ([4348ec4](https://github.com/grafana/grafana-cube-datasource/commit/4348ec482d17434df65fdfc84175eff71f155645)), closes [#357](https://github.com/grafana/grafana-cube-datasource/issues/357)
* **query-builder:** scope filter values by preceding + adhoc filters ([#32](https://github.com/grafana/grafana-cube-datasource/issues/32)) ([#453](https://github.com/grafana/grafana-cube-datasource/issues/453)) ([97bacaf](https://github.com/grafana/grafana-cube-datasource/commit/97bacaf9fdf56c77b23ade5fbc48cecf8117d302))
* **security/unknown/:** update module golang.org/x/net to v0.56.0 [security] ([#401](https://github.com/grafana/grafana-cube-datasource/issues/401)) ([e52d176](https://github.com/grafana/grafana-cube-datasource/commit/e52d176a51b39a32b5ec3252fa8aaed08d0c6b64))
* **security/unknown/:** update module golang.org/x/text to v0.39.0 [security] ([#402](https://github.com/grafana/grafana-cube-datasource/issues/402)) ([a4df655](https://github.com/grafana/grafana-cube-datasource/commit/a4df6559d2a5045b342e90b3c727e880e1e587f3))
* **time:** intersect per-panel timeDimensions with dashboard time range ([#173](https://github.com/grafana/grafana-cube-datasource/issues/173)) ([#457](https://github.com/grafana/grafana-cube-datasource/issues/457)) ([1cbc618](https://github.com/grafana/grafana-cube-datasource/commit/1cbc618c335a0ea80de30f5d94024e111276495a))

## [0.6.2](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.1...v0.6.2) (2026-06-03)


### Bug Fixes

* unbreak CI after re-enabling Actions (lockfile drift + node 24) ([#349](https://github.com/grafana/grafana-cube-datasource/issues/349)) ([ee206db](https://github.com/grafana/grafana-cube-datasource/commit/ee206db7577dc3c7576bdce9d8519f52f6507d8e))

## [0.6.1](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.0...v0.6.1) (2026-05-07)


### Bug Fixes

* **deps:** update all non-major dependencies ([#322](https://github.com/grafana/grafana-cube-datasource/issues/322)) ([7833059](https://github.com/grafana/grafana-cube-datasource/commit/78330595e43f4bf1210e00ef2f87c2047b920d66))

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
