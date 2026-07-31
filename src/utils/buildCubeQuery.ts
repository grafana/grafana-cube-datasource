import type { BinaryFilter, UnaryFilter, Filter as CubeJsFilter, Query as CubeJsQuery } from '@cubejs-client/core';
import { DataSource } from '../datasource';
import { CubeFilter, CubeFilterItem, CubeQuery, UNARY_OPERATORS, isCubeFilter, isCubeAndFilter, isCubeOrFilter } from '../types';
import { normalizeCubeQuery } from './normalizeCubeQuery';
import type { ViewSelectionMetadata } from './viewSelection';

export interface BuiltCubeQuery {
  /** The Cube query JSON, or '' when the query has no dimensions/measures. */
  json: string;
  /** AdHoc filters dropped because they target a different view (issue #307). */
  droppedAdHocFilters: CubeFilter[];
}

/**
 * Builds a Cube.js query JSON string from a Grafana query object.
 * Handles time dimensions, filters (including AdHoc filters), and ordering.
 *
 * This function uses @cubejs-client/core types to ensure compile-time
 * compatibility with Cube's /load endpoint format.
 *
 * Also returns the AdHoc filters that were dropped as inapplicable to this
 * query's view, so the SQL preview can explain why they did not apply (#307).
 */
export function buildCubeQueryJson(
  query: CubeQuery,
  datasource: DataSource,
  // Optional explicit view metadata. Callers (e.g. the SQL preview) pass the
  // reactive useMetadataQuery result so the "skipped N" hint updates when
  // metadata loads; falls back to the datasource cache otherwise (issue #307).
  metadata?: ViewSelectionMetadata
): BuiltCubeQuery {
  const normalizedQuery = normalizeCubeQuery(query, {
    datasourceName: datasource.name,
    datasourceUid: datasource.uid,
    mapOperator: (operator) => datasource.mapOperator(operator),
    metadata: metadata ?? datasource.getCachedMetadata() ?? undefined,
  });

  const droppedAdHocFilters = normalizedQuery.droppedAdHocFilters ?? [];

  if (!normalizedQuery.dimensions?.length && !normalizedQuery.measures?.length) {
    return { json: '', droppedAdHocFilters };
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

  return { json: JSON.stringify(cubeQuery), droppedAdHocFilters };
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
