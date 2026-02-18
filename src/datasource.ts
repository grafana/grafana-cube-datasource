import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend } from '@grafana/runtime';

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
  // Scopes results by any existing AdHoc filters (like Prometheus does)
  getTagValues(options: {
    key: string;
    filters?: Array<{ key: string; operator: string; value: string; values?: string[] }>;
  }) {
    // Convert existing filters to Cube format for scoping
    const scopingFilters = options.filters?.length
      ? options.filters.map((filter) => ({
          member: filter.key,
          operator: this.mapOperator(filter.operator),
          values: filter.values && filter.values.length > 0 ? filter.values : [filter.value],
        }))
      : undefined;

    return this.getResource('tag-values', {
      key: options.key,
      filters: scopingFilters ? JSON.stringify(scopingFilters) : undefined,
    });
  }

  // Get available dimensions and measures for the query builder
  getMetadata() {
    return this.getResource('metadata');
  }
}
