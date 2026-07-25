import { DataSourceInstanceSettings, CoreApp, ScopedVars, TimeRange } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { CubeQuery, CubeDataSourceOptions, DEFAULT_QUERY, Operator } from './types';
import { normalizeCubeQuery } from './utils/normalizeCubeQuery';

export class DataSource extends DataSourceWithBackend<CubeQuery, CubeDataSourceOptions> {
  readonly instanceSettings: DataSourceInstanceSettings<CubeDataSourceOptions>;

  constructor(instanceSettings: DataSourceInstanceSettings<CubeDataSourceOptions>) {
    super(instanceSettings);
    this.instanceSettings = instanceSettings;
  }

  getDefaultQuery(_: CoreApp): Partial<CubeQuery> {
    return DEFAULT_QUERY;
  }

  applyTemplateVariables(query: CubeQuery, scopedVars: ScopedVars): CubeQuery {
    // Keep runtime execution behavior aligned with SQL preview query shaping.
    const normalized = normalizeCubeQuery(query, {
      datasourceName: this.name,
      mapOperator: (operator) => this.mapOperator(operator),
      scopedVars,
    });

    return {
      ...query,
      timeDimensions: normalized.timeDimensions,
      filters: normalized.filters,
      order: normalized.order,
    };
  }

  // Made public so QueryEditor can use this for SQL preview with AdHoc filters
  mapOperator(grafanaOp: string): Operator {
    switch (grafanaOp) {
      case '=':
      case '=|': // "One of" - Cube's equals operator supports multiple values
        return Operator.Equals;
      case '!=':
      case '!=|': // "Not one of" - Cube's notEquals operator supports multiple values
        return Operator.NotEquals;
      // Note: =~ and !~ are Prometheus regex operators, not substring contains.
      // We intentionally don't (yet) map these to `contains` or `notContains` to avoid semantic confusion.
      // We don't yet test for the behaviour below because it's not desirable long term - it's a temporary workaround.
      case '=~':
        return Operator.Equals;
      case '!~':
        return Operator.NotEquals;
      default:
        return Operator.Equals;
    }
  }

  filterQuery(query: CubeQuery): boolean {
    // If no dimensions or measures have been provided, prevent the query from being executed
    return !!(query.dimensions?.length || query.measures?.length);
  }

  // Get available tag keys for AdHoc filtering from the backend
  // This uses the metadata endpoint and transforms dimensions to the TagKey format
  async getTagKeys() {
    const metadata = await this.getMetadata();
    // Transform dimensions from {label, value} to {text, value} for AdHoc filtering
    return metadata.dimensions.map((dimension: any) => ({
      text: dimension.label,
      value: dimension.value,
    }));
  }

  // Get available tag values for a specific key for AdHoc filtering
  // Scopes results by any existing AdHoc filters (like Prometheus does) and,
  // when $cubeTimeDimension is configured, by the dashboard time range Grafana
  // provides in options.timeRange (parity with Prometheus/Loki/Elasticsearch).
  getTagValues(options: {
    key: string;
    filters?: Array<{ key: string; operator: string; value: string; values?: string[] }>;
    // Context time range Grafana passes to getTagValues since v10.3.
    timeRange?: TimeRange;
  }) {
    // Convert existing filters to Cube format for scoping
    const scopingFilters = options.filters?.length
      ? options.filters.map((filter) => ({
          member: filter.key,
          operator: this.mapOperator(filter.operator),
          values: filter.values && filter.values.length > 0 ? filter.values : [filter.value],
        }))
      : undefined;

    const timeDimensions = this.buildTagValueTimeDimensions(options.timeRange);

    return this.getResource('tag-values', {
      key: options.key,
      filters: scopingFilters ? JSON.stringify(scopingFilters) : undefined,
      timeDimensions: timeDimensions ? JSON.stringify(timeDimensions) : undefined,
    });
  }

  // Build a Cube time dimension filter for tag-value lookups from the dashboard
  // time range. Requires BOTH a configured $cubeTimeDimension dashboard variable
  // (Cube needs to know WHICH dimension carries time, unlike Prometheus/Loki) and
  // a timeRange from Grafana. Returns undefined when either is missing, so
  // behavior is unchanged when the variable is not set (issue #35).
  private buildTagValueTimeDimensions(timeRange?: TimeRange): Array<{ dimension: string; dateRange: [string, string] }> | undefined {
    if (!timeRange) {
      return undefined;
    }

    const dimension = getTemplateSrv().replace('$cubeTimeDimension');
    if (!dimension || dimension === '$cubeTimeDimension') {
      return undefined;
    }

    const from = timeRange.from?.toISOString?.();
    const to = timeRange.to?.toISOString?.();
    if (!from || !to) {
      return undefined;
    }

    return [{ dimension, dateRange: [from, to] }];
  }

  // Get available dimensions and measures for the query builder
  getMetadata() {
    return this.getResource('metadata');
  }
}
