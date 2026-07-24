import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { SelectableValue } from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { DataSource } from './datasource';
import { fetchSqlDatasources } from './services/datasourceApi';
import { CubeFilter, DbSchemaResponse, GenerateSchemaRequest, ModelFilesResponse, Operator } from './types';

export interface MetadataOption {
  label: string;
  value: string;
  type: string;
  description?: string;
  // cube identifies the Cube view this field originates from. Visual queries
  // are intentionally scoped to a single view.
  cube: string;
}

export interface MetadataResponse {
  dimensions: MetadataOption[];
  measures: MetadataOption[];
}

export const useMetadataQuery = ({ datasource }: { datasource: DataSource }): UseQueryResult<MetadataResponse> => {
  return useQuery({
    queryKey: ['metadata', datasource.uid],
    queryFn: () => datasource.getMetadata(),
  });
};

// Datasource info (used for SQL preview to construct Explore links)
interface DatasourceInfo {
  type: string;
  uid: string;
  name?: string;
}

export const useDatasourceQuery = (datasourceUid?: string) => {
  const result = useQuery({
    queryKey: ['datasource', datasourceUid],
    queryFn: async (): Promise<DatasourceInfo> => {
      const { type, uid, name } = await getBackendSrv().get(`/api/datasources/uid/${datasourceUid}`);
      return { type, uid, name };
    },
    enabled: !!datasourceUid,
  });

  return {
    ...result,
    // Provide stable null when loading/error for backwards compatibility
    data: result.data ?? null,
  };
};

// SQL-compatible datasources (used in ConfigEditor dropdown)
const EMPTY_SQL_DATASOURCES: SelectableValue[] = [];

export const useSqlDatasourcesQuery = () => {
  const result = useQuery({
    queryKey: ['sqlDatasources'],
    queryFn: fetchSqlDatasources,
    staleTime: 0,
    gcTime: 0,
  });

  return {
    ...result,
    // Provide stable empty array when loading/error
    data: result.data ?? EMPTY_SQL_DATASOURCES,
  };
};

interface CompiledSqlResponse {
  sql?: string;
}

export const useCompiledSqlQuery = ({
  datasource,
  cubeQueryJson,
}: {
  datasource: DataSource;
  cubeQueryJson: string;
}): UseQueryResult<CompiledSqlResponse> => {
  return useQuery({
    queryKey: ['compiledSql', datasource.uid, cubeQueryJson],
    queryFn: () => datasource.getResource('sql', { query: cubeQueryJson }),
    enabled: Boolean(cubeQueryJson),
  });
};

interface TagValue {
  text: string;
}

/** Filter shape accepted by DataSource.getTagValues (Grafana AdHoc-style). */
export interface TagValueScopingFilter {
  key: string;
  operator: string;
  value: string;
  values?: string[];
}

interface AdHocFilter {
  key: string;
  operator: string;
  value: string;
  values?: string[];
}

/**
 * Build the scoping filters passed to getTagValues so the query-builder value
 * dropdown is progressively narrowed, matching AdHoc-filter behavior (issue #32).
 *
 * Two sources are combined:
 * - `adhocFilters`: active dashboard AdHoc filters (already in getTagValues shape).
 * - `precedingFilters`: complete query-builder filters that appear before the
 *   current row. Only equals/notEquals with a non-empty value set scope values;
 *   the query builder only supports those operators. The Cube operator enum is
 *   mapped back to the `=`/`!=` symbols getTagValues understands.
 *
 * Exported for unit testing.
 */
export function buildScopingTagFilters(
  precedingFilters: CubeFilter[] | undefined,
  adhocFilters: AdHocFilter[]
): TagValueScopingFilter[] {
  const fromAdhoc: TagValueScopingFilter[] = adhocFilters.map((f) => ({
    key: f.key,
    operator: f.operator,
    value: f.value,
    values: f.values,
  }));

  const fromPreceding: TagValueScopingFilter[] = (precedingFilters ?? [])
    .filter(
      (f): f is CubeFilter & { values: string[] } =>
        Boolean(f.member) &&
        Array.isArray(f.values) &&
        f.values.length > 0 &&
        (f.operator === Operator.Equals || f.operator === Operator.NotEquals)
    )
    .map((f) => ({
      key: f.member,
      operator: f.operator === Operator.NotEquals ? '!=' : '=',
      value: f.values[0],
      values: f.values,
    }));

  return [...fromAdhoc, ...fromPreceding];
}

/** Read active AdHoc filters for a datasource, defensively (templateSrv may be absent in tests). */
function readAdhocFilters(datasourceName: string): AdHocFilter[] {
  try {
    const templateSrv = getTemplateSrv() as ReturnType<typeof getTemplateSrv> & {
      getAdhocFilters?: (name: string) => AdHocFilter[] | undefined;
    };
    // NOTE: getAdhocFilters is deprecated. This mirrors the existing usage in
    // src/utils/normalizeCubeQuery.ts; both call sites should migrate together to
    // a supported UI-context API once one exists. Tracked by #129 (which currently
    // only covers the query-execution path, not this getTagValues lookup).
    return templateSrv.getAdhocFilters?.(datasourceName) ?? [];
  } catch {
    return [];
  }
}

export const useMemberValuesQuery = ({
  datasource,
  member,
  precedingFilters,
}: {
  datasource: DataSource;
  member: string | null;
  /** Complete query-builder filters positioned before this row, used to scope values. */
  precedingFilters?: CubeFilter[];
}): UseQueryResult<TagValue[]> => {
  // Combine dashboard AdHoc filters with the builder's preceding filters so the
  // dropdown is scoped like AdHoc filters (issue #32). Snapshotting into the
  // query key keeps results reactive to filter changes and avoids stale caches.
  const scopingFilters = buildScopingTagFilters(precedingFilters, readAdhocFilters(datasource.name));

  return useQuery<TagValue[]>({
    queryKey: ['memberValues', datasource.uid, member, scopingFilters],
    queryFn: async (): Promise<TagValue[]> => {
      if (!member) {
        return [];
      }
      return await datasource.getTagValues({
        key: member,
        filters: scopingFilters.length > 0 ? scopingFilters : undefined,
      });
    },
    enabled: !!member,
  });
};

// --- Data Model hooks ---

export const useDbSchemaQuery = (datasourceUid: string) => {
  return useQuery<DbSchemaResponse>({
    queryKey: ['dbSchema', datasourceUid],
    queryFn: () => getBackendSrv().get(`/api/datasources/uid/${datasourceUid}/resources/db-schema`),
    enabled: !!datasourceUid,
  });
};

export const useModelFilesQuery = (datasourceUid: string) => {
  return useQuery<ModelFilesResponse>({
    queryKey: ['modelFiles', datasourceUid],
    queryFn: () => getBackendSrv().get(`/api/datasources/uid/${datasourceUid}/resources/model-files`),
    enabled: !!datasourceUid,
  });
};

export const useGenerateSchemaMutation = (datasourceUid: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateSchemaRequest) =>
      getBackendSrv().post(`/api/datasources/uid/${datasourceUid}/resources/generate-schema`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelFiles', datasourceUid] });
    },
  });
};
