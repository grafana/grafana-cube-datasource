import type { AdHocVariableFilter, DataSourceRef } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

/**
 * Shape used throughout the plugin for dashboard AdHoc filters. Matches
 * Grafana's AdHocVariableFilter (key/operator/value[/values]).
 */
export type AdHocFilter = AdHocVariableFilter;

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
 */
export function resolveAdHocFilters(
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
