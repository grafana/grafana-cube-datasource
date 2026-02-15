import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { CubeQuery, CubeDataSourceOptions, DEFAULT_QUERY, CubeFilter, Operator } from './types';
import { filterValidCubeFilters } from './utils/filterValidation';

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
    const templateSrv = getTemplateSrv();

    // Dimensions and measures: pass through as-is (no interpolation of dashboard variables)
    // Why? YAGNI - don't implement until we need them.
    // They will likely be more complex to implement than filter-values, for two reasons:
    // 1. Visual query builder likely fails to show the dash-var name, and needs updating.
    //    Failing that, issue 58 will need to include them in a detectUnsupportedFeatures check.
    // 2. More work may be required in general - Cube API might reject them anyway

    // Apply template variable substitution to filter VALUES only (not member)
    // Filter values with variables like $user_id work correctly and render in the visual builder
    // Unary operators (set, notSet) have no values, so we skip interpolation for those
    const interpolatedFilters = query.filters?.map((filter) => ({
      ...filter,
      values: filter.values?.map((v) => templateSrv.replace(v, scopedVars)),
    }));

    // Check for AdHoc filters and inject them
    const adHocFilters = (templateSrv as any).getAdhocFilters ? (templateSrv as any).getAdhocFilters(this.name) : [];

    let filters: CubeFilter[] = interpolatedFilters ? [...interpolatedFilters] : [];

    if (adHocFilters && adHocFilters.length > 0) {
      // Convert AdHoc filters to Cube format
      const cubeFilters: CubeFilter[] = adHocFilters.map((filter: any) => ({
        member: filter.key,
        operator: this.mapOperator(filter.operator),
        // Multi-value operators (=| and !=|) use the values array; single-value operators use value
        values: filter.values && filter.values.length > 0 ? filter.values : [filter.value],
      }));

      filters = [...filters, ...cubeFilters];
    }

    // Apply template variable substitution to timeDimensions
    // timeDimensions is an array of objects, so we need to interpolate string values within each object
    let interpolatedTimeDimensions = query.timeDimensions?.map((td: any) => {
      if (typeof td === 'object' && td !== null) {
        const interpolated: any = {};
        for (const [key, value] of Object.entries(td)) {
          if (typeof value === 'string') {
            interpolated[key] = templateSrv.replace(value, scopedVars);
          } else if (Array.isArray(value)) {
            interpolated[key] = value.map((v) => (typeof v === 'string' ? templateSrv.replace(v, scopedVars) : v));
          } else {
            interpolated[key] = value;
          }
        }
        return interpolated;
      }
      return td;
    });

    // Dashboard-level time dimension support:
    // If query has no timeDimensions and $cubeTimeDimension dashboard variable is set,
    // inject a time dimension using Grafana's dashboard time range
    if (!interpolatedTimeDimensions?.length) {
      const dashboardTimeDimension = templateSrv.replace('$cubeTimeDimension', scopedVars);

      // Only inject if the variable was actually replaced (not returned as literal '$cubeTimeDimension')
      if (dashboardTimeDimension && dashboardTimeDimension !== '$cubeTimeDimension') {
        // Get Grafana's time range from scopedVars or template variables
        const fromTime = templateSrv.replace('$__from', scopedVars);
        const toTime = templateSrv.replace('$__to', scopedVars);

        // $__from and $__to are milliseconds timestamps - convert to ISO strings for Cube
        if (fromTime && toTime && fromTime !== '$__from' && toTime !== '$__to') {
          const fromDate = new Date(parseInt(fromTime, 10)).toISOString();
          const toDate = new Date(parseInt(toTime, 10)).toISOString();

          interpolatedTimeDimensions = [
            {
              dimension: dashboardTimeDimension,
              dateRange: [fromDate, toDate],
            },
          ];
        }
      }
    }

    const validFilters = filterValidCubeFilters(filters);

    return {
      ...query,
      timeDimensions: interpolatedTimeDimensions,
      filters: validFilters.length > 0 ? validFilters : undefined,
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
