import type { TimeDimension } from '@cubejs-client/core';
import type { ScopedVars } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { CubeFilter, CubeFilterItem, CubeQuery, Operator, UNARY_OPERATORS, isCubeAndFilter, isCubeFilter, isCubeOrFilter } from '../types';
import { filterValidCubeFilters } from './filterValidation';
import { normalizeOrder, OrderArray } from './normalizeOrder';

interface AdHocFilter {
  key: string;
  operator: string;
  value: string;
  values?: string[];
}

interface NormalizeCubeQueryOptions {
  datasourceName: string;
  mapOperator: (grafanaOperator: string) => Operator;
  scopedVars?: ScopedVars;
}

export interface NormalizedCubeQuery {
  dimensions?: string[];
  measures?: string[];
  timeDimensions?: TimeDimension[];
  filters?: CubeFilterItem[];
  order?: OrderArray;
  limit?: number;
}

/**
 * Produces a normalized Cube query shape shared by:
 * - runtime execution (applyTemplateVariables)
 * - SQL preview compilation (buildCubeQueryJson)
 *
 * Keeping this logic centralized prevents preview/runtime drift.
 */
export function normalizeCubeQuery(query: CubeQuery, options: NormalizeCubeQueryOptions): NormalizedCubeQuery {
  const templateSrv = getTemplateSrv();
  const scopedVars = options.scopedVars ?? {};

  const interpolatedFilters = query.filters?.map((item) => interpolateFilterItem(item, templateSrv, scopedVars)) ?? [];
  const adHocFilters = getAdHocFilters(templateSrv, options.datasourceName).map((filter): CubeFilter => ({
    member: filter.key,
    operator: options.mapOperator(filter.operator),
    // Multi-value operators (=| and !=|) use values array; otherwise fall back to single value.
    values: filter.values && filter.values.length > 0 ? filter.values : [filter.value],
  }));

  const validFilters = filterValidCubeFilters([...interpolatedFilters, ...adHocFilters]).map(stripUnaryFilterValues);

  const queryTimeDimensions = interpolateTimeDimensions(query.timeDimensions, templateSrv, scopedVars);
  const timeDimensions = queryTimeDimensions?.length ? queryTimeDimensions : injectDashboardTimeDimension(templateSrv, scopedVars);

  return {
    dimensions: query.dimensions?.length ? query.dimensions : undefined,
    measures: query.measures?.length ? query.measures : undefined,
    timeDimensions,
    filters: validFilters.length > 0 ? validFilters : undefined,
    order: normalizeOrder(query.order),
    limit: query.limit ?? undefined,
  };
}

function interpolateFilterItem(
  item: CubeFilterItem,
  templateSrv: ReturnType<typeof getTemplateSrv>,
  scopedVars: ScopedVars
): CubeFilterItem {
  if (isCubeFilter(item)) {
    return {
      ...item,
      values: item.values?.map((value) => templateSrv.replace(value, scopedVars)),
    };
  }

  if (isCubeAndFilter(item)) {
    return { and: item.and.map((child) => interpolateFilterItem(child, templateSrv, scopedVars)) };
  }

  if (isCubeOrFilter(item)) {
    return { or: item.or.map((child) => interpolateFilterItem(child, templateSrv, scopedVars)) };
  }

  return item;
}

function stripUnaryFilterValues(item: CubeFilterItem): CubeFilterItem {
  if (isCubeFilter(item)) {
    if (!UNARY_OPERATORS.has(item.operator)) {
      return item;
    }
    return { member: item.member, operator: item.operator };
  }

  if (isCubeAndFilter(item)) {
    return { and: item.and.map(stripUnaryFilterValues) };
  }

  if (isCubeOrFilter(item)) {
    return { or: item.or.map(stripUnaryFilterValues) };
  }

  return item;
}

function interpolateTimeDimensions(
  timeDimensions: CubeQuery['timeDimensions'],
  templateSrv: ReturnType<typeof getTemplateSrv>,
  scopedVars: ScopedVars
): TimeDimension[] | undefined {
  if (!timeDimensions?.length) {
    return undefined;
  }

  return timeDimensions.map((timeDimension) => {
    const rawTimeDimension = timeDimension as unknown as Record<string, unknown>;
    const interpolated = Object.fromEntries(
      Object.entries(rawTimeDimension).map(([key, value]) => {
        if (typeof value === 'string') {
          return [key, templateSrv.replace(value, scopedVars)];
        }

        if (Array.isArray(value)) {
          return [
            key,
            value.map((entry) => (typeof entry === 'string' ? templateSrv.replace(entry, scopedVars) : entry)),
          ];
        }

        return [key, value];
      })
    );

    return interpolated as unknown as TimeDimension;
  });
}

function injectDashboardTimeDimension(
  templateSrv: ReturnType<typeof getTemplateSrv>,
  scopedVars: ScopedVars
): TimeDimension[] | undefined {
  const dashboardTimeDimension = templateSrv.replace('$cubeTimeDimension', scopedVars);
  if (!dashboardTimeDimension || dashboardTimeDimension === '$cubeTimeDimension') {
    return undefined;
  }

  const fromTime = templateSrv.replace('$__from', scopedVars);
  const toTime = templateSrv.replace('$__to', scopedVars);
  if (!fromTime || !toTime || fromTime === '$__from' || toTime === '$__to') {
    return undefined;
  }

  const fromTimestamp = parseInt(fromTime, 10);
  const toTimestamp = parseInt(toTime, 10);
  if (Number.isNaN(fromTimestamp) || Number.isNaN(toTimestamp)) {
    return undefined;
  }

  const fromDate = new Date(fromTimestamp);
  const toDate = new Date(toTimestamp);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return undefined;
  }

  return [
    {
      dimension: dashboardTimeDimension,
      dateRange: [fromDate.toISOString(), toDate.toISOString()],
    },
  ];
}

function getAdHocFilters(templateSrv: ReturnType<typeof getTemplateSrv>, datasourceName: string): AdHocFilter[] {
  const withAdHoc = templateSrv as ReturnType<typeof getTemplateSrv> & {
    getAdhocFilters?: (name: string) => AdHocFilter[] | undefined;
  };

  return withAdHoc.getAdhocFilters?.(datasourceName) ?? [];
}
