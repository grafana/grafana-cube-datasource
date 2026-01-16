import { useState, useEffect } from 'react';
import { getBackendSrv } from '@grafana/runtime';

interface Datasource {
  type: string;
  uid: string;
  name?: string;
}

interface UseDatasourceReturn {
  datasource: Datasource | null;
  isLoading: boolean;
  error: string | null;
}

export function useDatasource(datasourceUid?: string): UseDatasourceReturn {
  const [datasource, setDatasource] = useState<Datasource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDatasource = async () => {
      if (!datasourceUid) {
        setDatasource(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { type, uid, name } = await getBackendSrv().get(`/api/datasources/uid/${datasourceUid}`);
        setDatasource({ type, uid, name });
      } catch (err) {
        setError('Failed to load datasource');
        setDatasource(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDatasource();
  }, [datasourceUid]);

  return { datasource, isLoading, error };
}

