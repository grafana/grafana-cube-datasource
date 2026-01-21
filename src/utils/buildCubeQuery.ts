import { getTemplateSrv } from '@grafana/runtime';
import { DataSource } from '../datasource';
import { CubeFilter, MyQuery } from '../types';

/**
 * Builds a Cube.js query JSON string from a Grafana query object.
 * Handles time dimensions, filters (including AdHoc filters), and ordering.
 */
export function buildCubeQueryJson(query: MyQuery, datasource: DataSource): string {
  if (!query.dimensions?.length && !query.measures?.length) {
    return '';
  }

  const cubeQuery: Record<string, unknown> = {};

  if (query.dimensions?.length) {
    cubeQuery.dimensions = query.dimensions;
  }

  if (query.measures?.length) {
    cubeQuery.measures = query.measures;
  }

  // Start with query-level time dimensions
  let timeDimensions = query.timeDimensions?.length ? [...query.timeDimensions] : [];

  // If no time dimensions in query, check for $cubeTimeDimension dashboard variable
  if (timeDimensions.length === 0) {
    const templateSrv = getTemplateSrv();
    const dashboardTimeDimension = templateSrv.replace('$cubeTimeDimension', {});

    // Only add if the variable was actually replaced (not returned as literal '$cubeTimeDimension')
    if (dashboardTimeDimension && dashboardTimeDimension !== '$cubeTimeDimension') {
      const fromTime = templateSrv.replace('$__from', {});
      const toTime = templateSrv.replace('$__to', {});

      // $__from and $__to are milliseconds timestamps - convert to ISO strings for Cube
      if (fromTime && toTime && fromTime !== '$__from' && toTime !== '$__to') {
        const fromTimestamp = parseInt(fromTime, 10);
        const toTimestamp = parseInt(toTime, 10);

        // Validate timestamps are valid numbers before creating Date objects
        if (!isNaN(fromTimestamp) && !isNaN(toTimestamp)) {
          const fromDate = new Date(fromTimestamp).toISOString();
          const toDate = new Date(toTimestamp).toISOString();

          timeDimensions = [
            {
              dimension: dashboardTimeDimension,
              dateRange: [fromDate, toDate],
            },
          ];
        }
      }
    }
  }

  if (timeDimensions.length > 0) {
    cubeQuery.timeDimensions = timeDimensions;
  }

  if (query.limit) {
    cubeQuery.limit = query.limit;
  }

  // Combine query-level filters with AdHoc filters
  let filters: CubeFilter[] = query.filters?.length ? [...query.filters] : [];

  // Get AdHoc filters and convert to Cube format
  const templateSrv = getTemplateSrv();
  const adHocFilters = (templateSrv as any).getAdhocFilters
    ? (templateSrv as any).getAdhocFilters(datasource.name)
    : [];

  if (adHocFilters && adHocFilters.length > 0) {
    const cubeFilters: CubeFilter[] = adHocFilters.map((filter: any) => ({
      member: filter.key,
      operator: datasource.mapOperator(filter.operator),
      // Multi-value operators (=| and !=|) use the values array; single-value operators use value
      values: filter.values && filter.values.length > 0 ? filter.values : [filter.value],
    }));

    filters = [...filters, ...cubeFilters];
  }

  // Filter out incomplete filters (Cube API requires values to be non-empty)
  const validFilters = filters.filter((f) => f.member && f.values.length > 0);

  if (validFilters.length > 0) {
    cubeQuery.filters = validFilters;
  }

  if (query.order) {
    cubeQuery.order = query.order;
  }

  return JSON.stringify(cubeQuery);
}
