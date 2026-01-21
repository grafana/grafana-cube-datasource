import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';

import { MyQuery, MyDataSourceOptions, DEFAULT_QUERY, CubeFilter } from './types';
import { filterValidCubeFilters } from './utils/filterValidation';

export class DataSource extends DataSourceWithBackend<MyQuery, MyDataSourceOptions> {
  readonly instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.instanceSettings = instanceSettings;
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return DEFAULT_QUERY;
  }

  applyTemplateVariables(query: MyQuery, scopedVars: ScopedVars): MyQuery {
    const templateSrv = getTemplateSrv();

    // Apply template variable substitution to dimensions and measures
    const interpolatedDimensions = query.dimensions?.map((d) => templateSrv.replace(d, scopedVars));
    const interpolatedMeasures = query.measures?.map((m) => templateSrv.replace(m, scopedVars));

    // Apply template variable substitution to filters
    const interpolatedFilters = query.filters?.map((filter) => ({
      ...filter,
      member: templateSrv.replace(filter.member, scopedVars),
      values: filter.values.map((v) => templateSrv.replace(v, scopedVars)),
    }));

    // Check for AdHoc filters and inject them
    const adHocFilters = (templateSrv as any).getAdhocFilters ? (templateSrv as any).getAdhocFilters(this.name) : [];

    let filters = interpolatedFilters ? [...interpolatedFilters] : [];

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
      dimensions: interpolatedDimensions,
      measures: interpolatedMeasures,
      timeDimensions: interpolatedTimeDimensions,
      filters: validFilters.length > 0 ? validFilters : undefined,
    };
  }

  // Made public so QueryEditor can use this for SQL preview with AdHoc filters
  mapOperator(grafanaOp: string): string {
    switch (grafanaOp) {
      case '=':
      case '=|': // "One of" - Cube's equals operator supports multiple values
        return 'equals';
      case '!=':
      case '!=|': // "Not one of" - Cube's notEquals operator supports multiple values
        return 'notEquals';
      case '=~':
        return 'contains';
      case '!~':
        return 'notContains';
      default:
        return 'equals';
    }
  }

  filterQuery(query: MyQuery): boolean {
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
