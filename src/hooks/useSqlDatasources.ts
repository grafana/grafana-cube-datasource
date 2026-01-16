import { useState, useEffect } from 'react';
import { SelectableValue } from '@grafana/data';
import { fetchSqlDatasources } from '../services/datasourceApi';

interface UseSqlDatasourcesReturn {
  sqlDatasources: SelectableValue[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Custom hook for fetching and managing SQL datasources
 * Encapsulates loading state, error handling, and retry logic
 */
export const useSqlDatasources = (): UseSqlDatasourcesReturn => {
  const [sqlDatasources, setSqlDatasources] = useState<SelectableValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSqlDatasources = async () => {
    try {
      setLoading(true);
      setError(null);
      const sqlDataSources = await fetchSqlDatasources();
      setSqlDatasources(sqlDataSources);
    } catch (err) {
      console.error('Failed to fetch SQL datasources:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load datasources';
      setError(errorMessage);

      // Set fallback error state for UI
      setSqlDatasources([
        {
          label: 'Error loading datasources',
          value: '',
          description: 'Failed to load datasources',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const retry = () => {
    loadSqlDatasources();
  };

  useEffect(() => {
    loadSqlDatasources();
  }, []);

  return {
    sqlDatasources,
    loading,
    error,
    retry,
  };
};

