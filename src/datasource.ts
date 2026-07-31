import { DataSourceInstanceSettings, CoreApp, ScopedVars, TimeRange, DataQueryRequest, DataQueryResponse } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import { CubeQuery, CubeDataSourceOptions, DEFAULT_QUERY, Operator } from './types';
import { normalizeCubeQuery } from './utils/normalizeCubeQuery';
import { buildMemberViewMap } from './utils/viewSelection';
import type { MetadataResponse } from './queries';

export class DataSource extends DataSourceWithBackend<CubeQuery, CubeDataSourceOptions> {
  readonly instanceSettings: DataSourceInstanceSettings<CubeDataSourceOptions>;

  // Cached view metadata (member -> view) so the synchronous runtime path
  // (applyTemplateVariables) can drop cross-view AdHoc filters (issue #307).
  private cachedMetadata: MetadataResponse | null = null;
  // Shared in-flight metadata fetch so a cold dashboard's concurrent per-panel
  // query() calls collapse to a SINGLE /v1/meta request instead of N (issue #307).
  private metadataInFlight: Promise<MetadataResponse> | null = null;

  constructor(instanceSettings: DataSourceInstanceSettings<CubeDataSourceOptions>) {
    super(instanceSettings);
    this.instanceSettings = instanceSettings;
    // Note: we intentionally do NOT prefetch metadata here. The async query()
    // path loads-and-caches it before the first query runs (issue #307), which
    // avoids firing a metadata request in non-query contexts (config editor /
    // health checks).
  }

  /** Synchronously exposes the cached view metadata, or null before it loads. */
  getCachedMetadata(): MetadataResponse | null {
    return this.cachedMetadata;
  }

  // Ensure the view metadata is loaded BEFORE any query is executed, so the very
  // first runtime query on a fresh dashboard can already scope AdHoc filters by
  // view (issue #307). applyTemplateVariables is synchronous and cannot await, so
  // we gate here in the async query() path; without this a cold-start dashboard
  // could inject cross-view filters and leave panels red until a manual refresh.
  query(request: DataQueryRequest<CubeQuery>): Observable<DataQueryResponse> {
    if (this.cachedMetadata) {
      return super.query(request);
    }
    // Best-effort: on failure, fall back to prior inject-all behavior.
    return from(this.getMetadata().catch(() => null)).pipe(mergeMap(() => super.query(request)));
  }

  getDefaultQuery(_: CoreApp): Partial<CubeQuery> {
    return DEFAULT_QUERY;
  }

  applyTemplateVariables(query: CubeQuery, scopedVars: ScopedVars): CubeQuery {
    // Keep runtime execution behavior aligned with SQL preview query shaping.
    const normalized = normalizeCubeQuery(query, {
      datasourceName: this.name,
      mapOperator: (operator) => this.mapOperator(operator),
      scopedVars,
      // Drop AdHoc filters that belong to a different Cube view (issue #307).
      metadata: this.cachedMetadata ?? undefined,
    });

    return {
      ...query,
      timeDimensions: normalized.timeDimensions,
      filters: normalized.filters,
      order: normalized.order,
    };
  }

  // Made public so QueryEditor can use this for SQL preview with AdHoc filters
  mapOperator(grafanaOp: string): Operator {
    switch (grafanaOp) {
      case '=':
      case '=|': // "One of" - Cube's equals operator supports multiple values
        return Operator.Equals;
      case '!=':
      case '!=|': // "Not one of" - Cube's notEquals operator supports multiple values
        return Operator.NotEquals;
      // Note: =~ and !~ are Prometheus regex operators, not substring contains.
      // We intentionally don't (yet) map these to `contains` or `notContains` to avoid semantic confusion.
      // We don't yet test for the behaviour below because it's not desirable long term - it's a temporary workaround.
      case '=~':
        return Operator.Equals;
      case '!~':
        return Operator.NotEquals;
      default:
        return Operator.Equals;
    }
  }

  filterQuery(query: CubeQuery): boolean {
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
  // Scopes results by any existing AdHoc filters (like Prometheus does) and,
  // when $cubeTimeDimension is configured, by the dashboard time range Grafana
  // provides in options.timeRange (parity with Prometheus/Loki/Elasticsearch).
  async getTagValues(options: {
    key: string;
    filters?: Array<{ key: string; operator: string; value: string; values?: string[] }>;
    // Context time range Grafana passes to getTagValues since v10.3.
    timeRange?: TimeRange;
  }) {
    // Nothing to partition or scope (no scoping filters and no time range): skip
    // the metadata fetch entirely — there is nothing to drop or view-check.
    if (!options.filters?.length && !options.timeRange) {
      return this.getResource('tag-values', {
        key: options.key,
        filters: undefined,
        timeDimensions: undefined,
      });
    }

    // Cube views are sealed namespaces: a scoping filter (or $cubeTimeDimension)
    // whose member lives in a different view than `key` makes /v1/load error (no
    // join path). Resolve view metadata so we can keep only same-view scoping
    // (issue #498, the value-lookup twin of #495). getTagValues is async, so we
    // can await; prefer the cache (Grafana calls getTagKeys -> getMetadata first,
    // so it is normally already warm) and only fetch when cold.
    let metadata = this.getCachedMetadata();
    if (!metadata) {
      try {
        metadata = await this.getMetadata();
      } catch {
        metadata = null;
      }
    }

    const scopingFilters = this.partitionScopingFiltersByView(options.key, options.filters, metadata);
    const timeDimensions = this.buildTagValueTimeDimensions(options.key, options.timeRange, metadata);

    return this.getResource('tag-values', {
      key: options.key,
      filters: scopingFilters ? JSON.stringify(scopingFilters) : undefined,
      timeDimensions: timeDimensions ? JSON.stringify(timeDimensions) : undefined,
    });
  }

  // Keep only scoping filters whose member belongs to the same Cube view as the
  // looked-up `key`; drop cross-view ones (which would error). Mirrors #495's
  // sealed-view doctrine on the value-lookup path (issue #498).
  private partitionScopingFiltersByView(
    key: string,
    filters: Array<{ key: string; operator: string; value: string; values?: string[] }> | undefined,
    metadata: MetadataResponse | null
  ): Array<{ member: string; operator: Operator; values: string[] }> | undefined {
    if (!filters?.length) {
      return undefined;
    }

    const toCube = (filter: { key: string; operator: string; value: string; values?: string[] }) => ({
      member: filter.key,
      operator: this.mapOperator(filter.operator),
      values: filter.values && filter.values.length > 0 ? filter.values : [filter.value],
    });

    // Without metadata we cannot resolve views; forward as-is (prior behavior).
    if (!metadata) {
      return filters.map(toCube);
    }

    const memberToView = buildMemberViewMap(metadata);
    const keyView = memberToView.get(key);

    // Edge case: `key` itself isn't in metadata (stale filter after a model
    // change / unknown). We can't determine its view, so drop ALL scoping
    // filters (attempt unscoped) rather than forward all and guarantee a
    // cross-view error.
    if (keyView === undefined) {
      return undefined;
    }

    const applicable = filters.filter((filter) => memberToView.get(filter.key) === keyView).map(toCube);
    return applicable.length > 0 ? applicable : undefined;
  }

  // Build a Cube time dimension filter for tag-value lookups from the dashboard
  // time range. Requires BOTH a configured $cubeTimeDimension dashboard variable
  // (Cube needs to know WHICH dimension carries time, unlike Prometheus/Loki) and
  // a timeRange from Grafana. Returns undefined when either is missing, so
  // behavior is unchanged when the variable is not set (issue #35).
  private buildTagValueTimeDimensions(
    key: string,
    timeRange: TimeRange | undefined,
    metadata: MetadataResponse | null
  ): Array<{ dimension: string; dateRange: [string, string] }> | undefined {
    if (!timeRange) {
      return undefined;
    }

    const dimension = getTemplateSrv().replace('$cubeTimeDimension');
    if (!dimension || dimension === '$cubeTimeDimension') {
      return undefined;
    }

    // Only inject the dashboard time dimension if it lives in the SAME view as
    // `key`; a cross-view time dimension errors just like a cross-view filter
    // (issue #498, #35 interaction). Without metadata we forward as before.
    if (metadata) {
      const memberToView = buildMemberViewMap(metadata);
      const keyView = memberToView.get(key);
      if (keyView === undefined || memberToView.get(dimension) !== keyView) {
        return undefined;
      }
    }

    const from = timeRange.from?.toISOString?.();
    const to = timeRange.to?.toISOString?.();
    if (!from || !to) {
      return undefined;
    }

    return [{ dimension, dateRange: [from, to] }];
  }

  // Get available dimensions and measures for the query builder.
  // Caches the result so the runtime path can scope AdHoc filters by view (#307),
  // and de-dupes concurrent fetches (a cold burst of panel queries shares one).
  getMetadata(): Promise<MetadataResponse> {
    if (this.metadataInFlight) {
      return this.metadataInFlight;
    }
    this.metadataInFlight = this.getResource<MetadataResponse>('metadata')
      .then((metadata) => {
        this.cachedMetadata = metadata;
        return metadata;
      })
      .finally(() => {
        this.metadataInFlight = null;
      });
    return this.metadataInFlight;
  }
}
