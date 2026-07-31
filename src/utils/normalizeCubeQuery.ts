import type { TimeDimension } from '@cubejs-client/core';
import type { ScopedVars } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { CubeFilter, CubeFilterItem, CubeQuery, Operator, UNARY_OPERATORS, isCubeAndFilter, isCubeFilter, isCubeOrFilter } from '../types';
import { filterValidCubeFilters } from './filterValidation';
import { normalizeOrder, OrderArray } from './normalizeOrder';
import { buildMemberViewMap, getViewSelectionState, ViewSelectionMetadata } from './viewSelection';

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
  /**
   * View metadata (dimensions/measures with their `cube`/view) used to drop
   * AdHoc filters that target a different Cube view than this query (issue #307).
   * When omitted (e.g. before metadata has loaded), AdHoc injection is unchanged.
   */
  metadata?: ViewSelectionMetadata;
}

export interface NormalizedCubeQuery {
  dimensions?: string[];
  measures?: string[];
  timeDimensions?: TimeDimension[];
  filters?: CubeFilterItem[];
  order?: OrderArray;
  limit?: number;
  /**
   * AdHoc filters that were dropped because they target a different view than
   * this query (or no view could be inferred). Surfaced in the SQL preview so
   * users understand why a dashboard filter did not apply (issue #307).
   */
  droppedAdHocFilters?: CubeFilter[];
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

  // Cube views are sealed namespaces (members are fully qualified, e.g. `view_a.region`).
  // Injecting an AdHoc filter for a member of a different view makes Cube /v1/load
  // error and turns unrelated panels red. Drop AdHoc filters whose member does not
  // belong to this query's inferred view (issue #307).
  const { applicable: applicableAdHocFilters, dropped: droppedAdHocFilters } = partitionAdHocFiltersByView(
    adHocFilters,
    query,
    options.metadata
  );

  const validFilters = filterValidCubeFilters([...interpolatedFilters, ...applicableAdHocFilters]).map(stripUnaryFilterValues);

  const queryTimeDimensions = interpolateTimeDimensions(query.timeDimensions, templateSrv, scopedVars) ?? [];
  const timeDimensions = applyDashboardTimeRange(queryTimeDimensions, templateSrv, scopedVars);

  return {
    dimensions: query.dimensions?.length ? query.dimensions : undefined,
    measures: query.measures?.length ? query.measures : undefined,
    timeDimensions,
    filters: validFilters.length > 0 ? validFilters : undefined,
    order: normalizeOrder(query.order),
    limit: query.limit ?? undefined,
    droppedAdHocFilters: droppedAdHocFilters.length > 0 ? droppedAdHocFilters : undefined,
  };
}

/**
 * Split injected AdHoc filters into those applicable to this query's view and
 * those that must be dropped (they target a different view), reusing the same
 * view-inference logic as the query builder's getViewSelectionState.
 *
 * - No metadata (not loaded yet): keep ALL AdHoc filters (prior behavior), so
 *   single-view dashboards are not regressed before metadata resolves.
 * - Metadata present but no view inferable (empty query / no dims/measures/
 *   panel-filters): skip AdHoc injection entirely (all dropped).
 * - Otherwise: keep filters whose member's view matches the query's view.
 *   Members not present in metadata are treated as non-matching and dropped.
 */
function partitionAdHocFiltersByView(
  adHocFilters: CubeFilter[],
  query: CubeQuery,
  metadata?: ViewSelectionMetadata
): { applicable: CubeFilter[]; dropped: CubeFilter[] } {
  if (!metadata) {
    return { applicable: adHocFilters, dropped: [] };
  }

  const { view } = getViewSelectionState(
    { dimensions: query.dimensions, measures: query.measures, filters: query.filters },
    metadata
  );

  if (!view) {
    return { applicable: [], dropped: adHocFilters };
  }

  const memberToView = buildMemberViewMap(metadata);
  const applicable: CubeFilter[] = [];
  const dropped: CubeFilter[] = [];
  for (const filter of adHocFilters) {
    if (memberToView.get(filter.member) === view) {
      applicable.push(filter);
    } else {
      dropped.push(filter);
    }
  }
  return { applicable, dropped };
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

/**
 * Combine the panel's own timeDimensions with the dashboard-level time range
 * (from $cubeTimeDimension) so the dashboard range ALWAYS narrows results,
 * rather than being replaced by a panel's hardcoded timeDimensions (issue #173).
 *
 * When $cubeTimeDimension is configured and a dashboard range is available, the
 * dashboard entry is appended as an additional timeDimensions entry. Cube ANDs
 * every timeDimensions entry in the WHERE clause, so:
 * - a panel entry for the SAME dimension with a different dateRange intersects
 *   with the dashboard range (two same-dimension entries = AND of both ranges), and
 * - panel entries for DIFFERENT dimensions keep their own filtering while the
 *   dashboard range is added alongside them.
 *
 * When the panel has no timeDimensions, or $cubeTimeDimension / the range are not
 * configured, behavior is unchanged.
 *
 * NOTE: we intentionally do NOT client-side dedupe/overlap-optimize matching
 * ranges here — that is a deferred follow-up (see issue #173). Sending both
 * entries is correct because Cube computes the intersection server-side.
 */
function applyDashboardTimeRange(
  queryTimeDimensions: TimeDimension[],
  templateSrv: ReturnType<typeof getTemplateSrv>,
  scopedVars: ScopedVars
): TimeDimension[] | undefined {
  const dashboardTimeDimension = injectDashboardTimeDimension(templateSrv, scopedVars);

  if (!dashboardTimeDimension) {
    // No dashboard range to apply: preserve the panel's timeDimensions as-is.
    return queryTimeDimensions.length ? queryTimeDimensions : undefined;
  }

  // Always AND the dashboard range in, even when the panel already has entries.
  return [...queryTimeDimensions, ...dashboardTimeDimension];
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
