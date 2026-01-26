import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { CubeQuery, CubeDataSourceOptions } from './types';
import { withQueryClient } from 'queryClient';

export const plugin = new DataSourcePlugin<DataSource, CubeQuery, CubeDataSourceOptions>(DataSource)
  .setConfigEditor(withQueryClient(ConfigEditor))
  .setQueryEditor(withQueryClient(QueryEditor));
