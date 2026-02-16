import type { BinaryFilter, UnaryFilter, Filter as CubeJsFilter, Query as CubeJsQuery, TimeDimension } from '@cubejs-client/core';
import { getTemplateSrv } from '@grafana/runtime';
import { DataSource } from '../datasource';
import { CubeFilter, CubeFilterItem, CubeQuery, UNARY_OPERATORS, isCubeFilter, isCubeAndFilter, isCubeOrFilter } from '../types';
import { filterValidCubeFilters } from './filterValidation';
import { normalizeOrder } from './normalizeOrder';

/**
 * Builds a Cube.js query JSON string from a Grafana query object.
 * Handles time dimensions, filters (including AdHoc filters), and ordering.
 *
 * This function uses @cubejs-client/core types to ensure compile-time
 * compatibility with Cube's /load endpoint format.
 */
export function buildCubeQueryJson(query: CubeQuery, datasource: DataSource): string {
  if (!query.dimensions?.length && !query.measures?.length) {
    return '';
  }

  // Using CubeJsQuery type for compile-time checking against Cube's official API
  const cubeQuery: CubeJsQuery = {};

  if (query.dimensions?.length) {
    cubeQuery.dimensions = query.dimensions;
  }

  if (query.measures?.length) {
    cubeQuery.measures = query.measures;
  }

  // Start with query-level time dimensions
  let timeDimensions: TimeDimension[] = query.timeDimensions?.length ? [...query.timeDimensions] : [];

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

  if (query.limit != null) {
    cubeQuery.limit = query.limit;
  }

  // Combine query-level filters with AdHoc filters
  let filters: CubeFilterItem[] = query.filters?.length ? [...query.filters] : [];

  // Get AdHoc filters and convert to Cube format (always flat filters)
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

  const validFilters = filterValidCubeFilters(filters);

  if (validFilters.length > 0) {
    cubeQuery.filters = validFilters.map(toCubeJsFilter);
  }

  const normalizedOrder = normalizeOrder(query.order);
  if (normalizedOrder) {
    cubeQuery.order = normalizedOrder;
  }

  return JSON.stringify(cubeQuery);
}

/**
 * Recursively converts our internal filter types to Cube's official Filter types.
 * Handles flat filters (binary/unary) and logical groups (and/or).
 */
function toCubeJsFilter(item: CubeFilterItem): CubeJsFilter {
  if (isCubeFilter(item)) {
    if (UNARY_OPERATORS.has(item.operator)) {
      return {
        member: item.member,
        operator: item.operator as unknown as UnaryFilter['operator'],
      };
    }
    return {
      member: item.member,
      operator: item.operator as unknown as BinaryFilter['operator'],
      values: item.values ?? [],
    };
  }

  if (isCubeAndFilter(item)) {
    return { and: item.and.map(toCubeJsFilter) };
  }

  if (isCubeOrFilter(item)) {
    return { or: item.or.map(toCubeJsFilter) };
  }

  // Should never reach here with valid types, but satisfy the compiler
  return item as CubeJsFilter;
}
