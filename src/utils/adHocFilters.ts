import type { AdHocVariableFilter } from '@grafana/data';
import type { DataSourceRef } from '@grafana/schema';
import { getTemplateSrv } from '@grafana/runtime';

/**
 * Shape used throughout the plugin for dashboard AdHoc filters. Matches
 * Grafana's AdHocVariableFilter (key/operator/value[/values]).
 */
export type AdHocFilter = AdHocVariableFilter;

/** Scenes' multi-value "one of" operator. */
const ONE_OF_OPERATOR = '=|';

/**
 * Scenes' "All" sentinel value. Not exported by any @grafana package, so the
 * literal is duplicated here (it matches ALL_VARIABLE_VALUE in grafana/scenes).
 */
const ALL_VALUE = '$__all';

/**
 * Scenes' match-all filters — a pinned filter that restricts nothing, displayed
 * as "All". Two shapes exist and both must resolve to no-filter:
 *
 * - `=| $__all` — the current shape. Since grafana/scenes#1591 a dashboard-origin
 *   filter carries the All sentinel on the "one of" operator, whether authored
 *   that way in the default filters editor or selected by a viewer.
 * - `=~ .*` — the older shape, still produced for datasources that do not
 *   declare multi-value operators (issue #530).
 *
 * Scenes excludes both from `DataQueryRequest.filters`, but they still reach the
 * plugin: when that list arrives empty, resolveAdHocFilters falls back to the
 * dashboard AdHoc variable's raw filters (issue #127), which recovers exactly
 * what scenes removed. So the drop has to happen here, not upstream.
 *
 * Forwarding either shape inverts the intent. This plugin has no regex operators
 * and mapOperator collapses both `=~` and `=|` to equals, so the pill promises
 * everything while the query asks for `x equals '.*'` / `x equals '$__all'` —
 * matching nothing.
 *
 * Note this also drops a MANUALLY authored `=~ '.*'`, or `$__all` picked via
 * "one of" — intentional, since the shapes are indistinguishable and "restrict
 * nothing" is what a user selecting them would expect anyway. Anyone needing the
 * literal string must use `= '.*'` / `= '$__all'`, which are untouched.
 */
export function isMatchAllFilter(filter: Pick<AdHocFilter, 'operator' | 'value' | 'values'>): boolean {
  if (filter.operator === ONE_OF_OPERATOR) {
    return (filter.values ?? (filter.value ? [filter.value] : [])).includes(ALL_VALUE);
  }

  return filter.operator === '=~' && filter.value === '.*';
}

/** Drop scenes' match-all sentinel filters — see isMatchAllFilter (issue #530). */
export function dropMatchAllFilters<T extends Pick<AdHocFilter, 'operator' | 'value' | 'values'>>(filters: T[]): T[] {
  return filters.filter((filter) => !isMatchAllFilter(filter));
}

/**
 * Resolve AdHoc filters for a datasource.
 *
 * Prefer a non-empty explicitly-passed list (the third argument of
 * `applyTemplateVariables` / `DataQueryRequest.filters` — the supported Grafana
 * path after `templateSrv.getAdhocFilters` was deprecated; see issue #127).
 *
 * When no list is passed — or Grafana passes an empty array because scenes +
 * deprecated getAdhocFilters did not see the variable — read active AdHoc
 * variables from `templateSrv.getVariables()` that target this datasource.
 * Fall back to the deprecated `getAdhocFilters(name)` for older Grafana.
 *
 * Match-all sentinels (`=| $__all` and `=~ .*`) are dropped from the result after
 * resolution, so an explicit list containing only match-all filters still counts
 * as an intentional (now empty) selection and does not fall back to other sources.
 */
export function resolveAdHocFilters(
  datasource: { name: string; uid: string },
  explicitFilters?: AdHocFilter[] | null
): AdHocFilter[] {
  return dropMatchAllFilters(resolveAdHocFiltersRaw(datasource, explicitFilters));
}

function resolveAdHocFiltersRaw(
  datasource: { name: string; uid: string },
  explicitFilters?: AdHocFilter[] | null
): AdHocFilter[] {
  if (explicitFilters && explicitFilters.length > 0) {
    return explicitFilters;
  }

  const fromVariables = readAdHocFiltersFromVariables(datasource);
  if (fromVariables !== null) {
    return fromVariables;
  }

  // Preserve intentional empty explicit list when no dashboard variables exist
  // (e.g. Explore with filters: []).
  if (explicitFilters) {
    return explicitFilters;
  }

  return readDeprecatedGetAdhocFilters(datasource.name);
}

function readAdHocFiltersFromVariables(datasource: { name: string; uid: string }): AdHocFilter[] | null {
  try {
    const variables = getTemplateSrv().getVariables?.() ?? [];
    const matching = variables.filter(
      (variable): variable is Extract<(typeof variables)[number], { type: 'adhoc' }> =>
        variable.type === 'adhoc' && adHocVariableTargetsDatasource(variable.datasource, datasource)
    );

    // No AdHoc variables on the dashboard → fall through to deprecated API
    // (Explore / older Grafana may still rely on it).
    if (matching.length === 0) {
      return null;
    }

    return matching.flatMap((variable) => variable.filters ?? []);
  } catch {
    return null;
  }
}

function adHocVariableTargetsDatasource(
  ref: DataSourceRef | string | null | undefined,
  datasource: { name: string; uid: string }
): boolean {
  if (ref == null) {
    return false;
  }
  if (typeof ref === 'string') {
    return ref === datasource.uid || ref === datasource.name;
  }
  if (ref.uid) {
    return ref.uid === datasource.uid || ref.uid === datasource.name;
  }
  // Legacy name-only refs
  return (ref as { name?: string }).name === datasource.name;
}

function readDeprecatedGetAdhocFilters(datasourceName: string): AdHocFilter[] {
  try {
    const templateSrv = getTemplateSrv() as ReturnType<typeof getTemplateSrv> & {
      getAdhocFilters?: (name: string) => AdHocFilter[] | undefined;
    };
    return templateSrv.getAdhocFilters?.(datasourceName) ?? [];
  } catch {
    return [];
  }
}
