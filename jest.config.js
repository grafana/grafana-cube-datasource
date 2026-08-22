// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...require('./.config/jest.config'),
  // @grafana/plugin-ui (>=0.17) pulls in the ESM-only transitive dep @marcbachmann/cel-js, and
  // @grafana/data (>=13.2) pulls in the ESM-only @react-hookz/web (via its useObservable hook),
  // which in turn pulls in ESM-only @ver0/deep-equal. Jest must transform all of them. Extend the
  // scaffolding's ESM allowlist here rather than editing .config/ (owned by @grafana/create-plugin).
  transformIgnorePatterns: [
    nodeModulesToTransform([
      ...grafanaESModules,
      '@marcbachmann/cel-js',
      '@react-hookz/web',
      '@ver0/deep-equal',
    ]),
  ],
};
