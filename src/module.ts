import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { DataModelConfigPage } from './components/DataModelConfigPage';
import { CubeQuery, CubeDataSourceOptions } from './types';
import { withQueryClient } from 'queryClient';

export const plugin = new DataSourcePlugin<DataSource, CubeQuery, CubeDataSourceOptions>(DataSource)
  .setConfigEditor(withQueryClient(ConfigEditor))
  .setQueryEditor(withQueryClient(QueryEditor))
  .addConfigPage({
    title: 'Data Model',
    id: 'data-model',
    icon: 'cube',
    body: withQueryClient(DataModelConfigPage),
  });
