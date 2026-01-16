import { getBackendSrv } from '@grafana/runtime';
import { fetchSqlDatasources } from './datasourceApi';

// Mock @grafana/runtime
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: jest.fn(),
}));

const mockGetBackendSrv = getBackendSrv as jest.Mock;

describe('datasourceApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchSqlDatasources', () => {
    it('should fetch and filter SQL-compatible datasources', async () => {
      const mockDatasources = [
        { name: 'PostgreSQL Prod', uid: 'pg-prod', type: 'postgres' },
        { name: 'MySQL Dev', uid: 'mysql-dev', type: 'mysql' },
        { name: 'Prometheus', uid: 'prom-1', type: 'prometheus' },
        { name: 'Loki', uid: 'loki-1', type: 'loki' },
        { name: 'BigQuery', uid: 'bq-1', type: 'grafana-bigquery-datasource' },
      ];

      const mockPlugins = [
        { id: 'postgres', info: { logos: { small: '/img/postgres.svg' } } },
        { id: 'mysql', info: { logos: { small: '/img/mysql.svg' } } },
        { id: 'prometheus', info: { logos: { small: '/img/prometheus.svg' } } },
        { id: 'loki', info: { logos: { small: '/img/loki.svg' } } },
        { id: 'grafana-bigquery-datasource', info: { logos: { small: '/img/bigquery.svg' } } },
      ];

      const mockGet = jest.fn().mockImplementation((url: string) => {
        if (url === '/api/datasources') {
          return Promise.resolve(mockDatasources);
        }
        if (url === '/api/plugins?type=datasource') {
          return Promise.resolve(mockPlugins);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      mockGetBackendSrv.mockReturnValue({ get: mockGet });

      const result = await fetchSqlDatasources();

      // Should only include SQL-compatible datasources
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { label: 'PostgreSQL Prod', value: 'pg-prod', description: 'postgres', imgUrl: '/img/postgres.svg' },
        { label: 'MySQL Dev', value: 'mysql-dev', description: 'mysql', imgUrl: '/img/mysql.svg' },
        { label: 'BigQuery', value: 'bq-1', description: 'grafana-bigquery-datasource', imgUrl: '/img/bigquery.svg' },
      ]);
    });

    it('should correctly identify various SQL datasource types', async () => {
      const sqlTypes = [
        'postgres',
        'mysql',
        'grafana-bigquery-datasource',
        'snowflake',
        'grafana-athena-datasource',
        'redshift',
        'clickhouse',
        'sqlite',
        'mssql',
        'mariadb',
        'oracle',
        'vertica',
        'databricks',
        'trino',
        'presto',
        'cockroachdb',
      ];

      const mockDatasources = sqlTypes.map((type, i) => ({
        name: `DS ${i}`,
        uid: `uid-${i}`,
        type,
      }));

      const mockGet = jest.fn().mockImplementation((url: string) => {
        if (url === '/api/datasources') {
          return Promise.resolve(mockDatasources);
        }
        if (url === '/api/plugins?type=datasource') {
          return Promise.resolve([]);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      mockGetBackendSrv.mockReturnValue({ get: mockGet });

      const result = await fetchSqlDatasources();

      // All SQL types should be included
      expect(result).toHaveLength(sqlTypes.length);
    });

    it('should exclude non-SQL datasource types', async () => {
      const nonSqlTypes = ['prometheus', 'loki', 'tempo', 'jaeger', 'elasticsearch', 'influxdb', 'graphite'];

      const mockDatasources = nonSqlTypes.map((type, i) => ({
        name: `DS ${i}`,
        uid: `uid-${i}`,
        type,
      }));

      const mockGet = jest.fn().mockImplementation((url: string) => {
        if (url === '/api/datasources') {
          return Promise.resolve(mockDatasources);
        }
        if (url === '/api/plugins?type=datasource') {
          return Promise.resolve([]);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      mockGetBackendSrv.mockReturnValue({ get: mockGet });

      const result = await fetchSqlDatasources();

      // None should be included
      expect(result).toHaveLength(0);
    });

    it('should handle missing plugin logos gracefully', async () => {
      const mockDatasources = [{ name: 'PostgreSQL', uid: 'pg-1', type: 'postgres' }];

      const mockGet = jest.fn().mockImplementation((url: string) => {
        if (url === '/api/datasources') {
          return Promise.resolve(mockDatasources);
        }
        if (url === '/api/plugins?type=datasource') {
          return Promise.resolve([]); // No plugin info
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      mockGetBackendSrv.mockReturnValue({ get: mockGet });

      const result = await fetchSqlDatasources();

      expect(result).toHaveLength(1);
      expect(result[0].imgUrl).toBeUndefined();
    });

    it('should throw error when API call fails', async () => {
      const mockGet = jest.fn().mockRejectedValue(new Error('Network error'));
      mockGetBackendSrv.mockReturnValue({ get: mockGet });

      await expect(fetchSqlDatasources()).rejects.toThrow('Failed to load datasources');
    });

    it('should handle empty datasources list', async () => {
      const mockGet = jest.fn().mockImplementation((url: string) => {
        if (url === '/api/datasources') {
          return Promise.resolve([]);
        }
        if (url === '/api/plugins?type=datasource') {
          return Promise.resolve([]);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      mockGetBackendSrv.mockReturnValue({ get: mockGet });

      const result = await fetchSqlDatasources();

      expect(result).toHaveLength(0);
    });
  });
});

