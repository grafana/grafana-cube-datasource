import type { AdHocVariableFilter } from '@grafana/data';
import type { DataSourceRef } from '@grafana/schema';
import { getTemplateSrv } from '@grafana/runtime';

/**
 * Shape used throughout the plugin for dashboard AdHoc filters. Matches
 * Grafana's AdHocVariableFilter (key/operator/value[/values]).
 */
export type AdHocFilter = AdHocVariableFilter;

/**
 * Scenes' match-all sentinel. Clearing a dashboard-origin (pinned) filter
 * rewrites it to `operator: '=~', value: '.*'` (displayed as "All") and scenes
 * passes it through to the datasource, meaning "this filter restricts nothing"
 * — which is literally how Prometheus evaluates it (anchored matchers, absent
 * labels match `.*`). This plugin has no regex operators (`=~` maps to equals
 * in mapOperator), so forwarding it would invert the intent into
 * `x equals '.*'` — matching nothing. Treat it as no-filter instead (issue #530).
 *
 * Note this also drops a MANUALLY authored `=~ '.*'` — intentional, since the
 * shapes are indistinguishable and the sentinel semantics ("restrict nothing")
 * are what a user typing that would expect anyway. Anyone relying on the
 * temporary =~→equals mapping to match the literal string `.*` must use
 * `= '.*'`, which is untouched.
 */
export function isMatchAllFilter(filter: Pick<AdHocFilter, 'operator' | 'value'>): boolean {
  return filter.operator === '=~' && filter.value === '.*';
}

/** Drop scenes' match-all sentinel filters — see isMatchAllFilter (issue #530). */
export function dropMatchAllFilters<T extends Pick<AdHocFilter, 'operator' | 'value'>>(filters: T[]): T[] {
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
 * Match-all sentinels (`=~ .*`) are dropped from the result after resolution,
 * so an explicit list containing only match-all filters still counts as an
 * intentional (now empty) selection and does not fall back to other sources.
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
