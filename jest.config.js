// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...require('./.config/jest.config'),
  // @grafana/plugin-ui (>=0.17) pulls in the ESM-only transitive dep @marcbachmann/cel-js,
  // which Jest must transform. Extend the scaffolding's ESM allowlist here rather than editing
  // .config/ (owned by @grafana/create-plugin).
  transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, '@marcbachmann/cel-js'])],
};
