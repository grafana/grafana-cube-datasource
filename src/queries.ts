import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { DataSource } from 'datasource';
import { fetchSqlDatasources } from './services/datasourceApi';

export interface MetadataOption {
  label: string;
  value: string;
  type: string;
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

export const useMemberValuesQuery = ({
  datasource,
  member,
}: {
  datasource: DataSource;
  member: string | null;
}): UseQueryResult<TagValue[]> => {
  return useQuery<TagValue[]>({
    queryKey: ['memberValues', datasource.uid, member],
    queryFn: async (): Promise<TagValue[]> => {
      if (!member) {
        return [];
      }
      return await datasource.getTagValues({ key: member });
    },
    enabled: !!member,
  });
};
