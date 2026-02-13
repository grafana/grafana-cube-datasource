import React from 'react';
import { PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { Alert } from '@grafana/ui';
import { DatabaseTree } from './DatabaseTree';

function getDatasourceUidFromLocation(pathname: string): string | null {
  const match = pathname.match(/\/datasources\/edit\/([^/]+)/);
  return match ? match[1] : null;
}

export function DataModelConfigPage({ plugin }: PluginConfigPageProps<PluginMeta>) {
  const datasourceUid = getDatasourceUidFromLocation(window.location.pathname);
  const [selectedTables, setSelectedTables] = React.useState<string[]>([]);

  if (!datasourceUid) {
    return (
      <Alert severity="error" title="Could not load datasource UID">
        This page requires a datasource edit route.
      </Alert>
    );
  }

  return (
    <div>
      <h3>Data Model</h3>
      <p>This page will let you generate Cube data models from your database schema.</p>
      <p>Plugin ID: {plugin.meta.id}</p>
      <DatabaseTree datasourceUid={datasourceUid} selectedTables={selectedTables} onTableSelect={setSelectedTables} />
    </div>
  );
}
