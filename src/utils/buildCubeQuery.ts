import type { BinaryFilter, UnaryFilter, Filter as CubeJsFilter, Query as CubeJsQuery } from '@cubejs-client/core';
import { DataSource } from '../datasource';
import { CubeFilterItem, CubeQuery, UNARY_OPERATORS, isCubeFilter, isCubeAndFilter, isCubeOrFilter } from '../types';
import { normalizeCubeQuery } from './normalizeCubeQuery';

/**
 * Builds a Cube.js query JSON string from a Grafana query object.
 * Handles time dimensions, filters (including AdHoc filters), and ordering.
 *
 * This function uses @cubejs-client/core types to ensure compile-time
 * compatibility with Cube's /load endpoint format.
 */
export function buildCubeQueryJson(query: CubeQuery, datasource: DataSource): string {
  const normalizedQuery = normalizeCubeQuery(query, {
    datasourceName: datasource.name,
    mapOperator: (operator) => datasource.mapOperator(operator),
  });

  if (!normalizedQuery.dimensions?.length && !normalizedQuery.measures?.length) {
    return '';
  }

  // Using CubeJsQuery type for compile-time checking against Cube's official API
  const cubeQuery: CubeJsQuery = {};

  if (normalizedQuery.dimensions?.length) {
    cubeQuery.dimensions = normalizedQuery.dimensions;
  }

  if (normalizedQuery.measures?.length) {
    cubeQuery.measures = normalizedQuery.measures;
  }

  if (normalizedQuery.timeDimensions?.length) {
    cubeQuery.timeDimensions = normalizedQuery.timeDimensions;
  }

  if (normalizedQuery.filters) {
    cubeQuery.filters = normalizedQuery.filters.map(toCubeJsFilter);
  }

  if (normalizedQuery.order) {
    cubeQuery.order = normalizedQuery.order;
  }

  if (normalizedQuery.limit != null) {
    cubeQuery.limit = normalizedQuery.limit;
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
