import { getBackendSrv } from '@grafana/runtime';
import { SelectableValue } from '@grafana/data';

// SQL-compatible datasource types - using fuzzy matching keywords
// This is a list of datasources which are both present in Grafana
// and also present in (or compatible with) Cube.js
// Based on Cube's supported databases: https://cube.dev/docs/product/configuration/data-sources
const SQL_DATASOURCE_KEYWORDS = [
  'postgres',
  'mysql',
  'bigquery',
  'snowflake',
  'athena',
  'redshift',
  'clickhouse',
  'sqlite',
  'sql',
  'mariadb',
  'oracle',
  'mssql',
  'vertica',
  'databricks',
  'trino',
  'presto',
  'cockroach',
];

// Helper function to check if a datasource type is SQL-compatible using fuzzy matching
const isSqlCompatible = (datasourceType: string): boolean => {
  const lowerType = datasourceType.toLowerCase();
  return SQL_DATASOURCE_KEYWORDS.some((keyword) => lowerType.includes(keyword.toLowerCase()));
};

interface DatasourceInfo {
  name: string;
  uid: string;
  type: string;
}

interface PluginInfo {
  id: string;
  info?: {
    logos?: {
      small?: string;
      large?: string;
    };
  };
}

/**
 * Fetches available SQL-compatible datasources from Grafana
 * @returns Promise<SelectableValue[]> Array of SQL datasources formatted for Select component
 */
export const fetchSqlDatasources = async (): Promise<SelectableValue[]> => {
  try {
    // Fetch both datasource instances and plugin metadata
    const [datasources, plugins] = await Promise.all([
      getBackendSrv().get('/api/datasources'),
      getBackendSrv().get('/api/plugins?type=datasource'),
    ]);

    // Create a map of plugin type to plugin metadata (including images)
    const pluginMap = plugins.reduce((acc: Record<string, PluginInfo>, plugin: PluginInfo) => {
      acc[plugin.id] = plugin;
      return acc;
    }, {});

    const sqlDataSources = datasources
      .filter(({ type }: DatasourceInfo) => isSqlCompatible(type))
      .map(({ name, uid, type }: DatasourceInfo) => {
        const plugin = pluginMap[type];
        const imgUrl = plugin?.info?.logos?.small || plugin?.info?.logos?.large;

        return {
          label: name,
          value: uid,
          description: type,
          imgUrl,
        };
      });

    return sqlDataSources;
  } catch (error) {
    console.error('Failed to fetch SQL datasources:', error);
    throw new Error('Failed to load datasources');
  }
};

