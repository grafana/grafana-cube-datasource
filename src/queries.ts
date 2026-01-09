import { useQuery } from '@tanstack/react-query';
import { ComboboxOption } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { DataSource } from 'datasource';
import { fetchSqlDatasources } from './services/datasourceApi';

interface MetadataResponse {
  dimensions: Array<ComboboxOption<string>>;
  measures: Array<ComboboxOption<string>>;
}

const EMPTY_METADATA: MetadataResponse = {
  dimensions: [],
  measures: [],
};

export const useMetadataQuery = ({ datasource }: { datasource: DataSource }) => {
  const result = useQuery({
    queryKey: ['metadata', datasource.uid],
    queryFn: (): Promise<MetadataResponse> => datasource.getMetadata(),
  });

  return {
    ...result,
    // Provide stable empty arrays when loading/error to avoid undefined destructuring
    data: result.data ?? EMPTY_METADATA,
  };
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

export const useCompiledSqlQuery = ({ datasource, queryJson }: { datasource: DataSource; queryJson: string }) => {
  const result = useQuery({
    queryKey: ['compiledSql', datasource.uid, queryJson],
    queryFn: (): Promise<CompiledSqlResponse> => datasource.getResource('sql', { query: queryJson }),
    // Only fetch when we have a valid query JSON
    enabled: !!queryJson,
  });

  return {
    ...result,
    // Extract SQL with fallback`
    data: result.data?.sql ?? '',
  };
};
