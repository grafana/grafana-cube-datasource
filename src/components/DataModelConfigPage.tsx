import React, { useMemo, useState } from 'react';
import { PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { Alert } from '@grafana/ui';
import { DatabaseTree } from './DatabaseTree';

const getDatasourceUidFromPath = (pathname: string): string | null => {
  const match = pathname.match(/\/datasources\/edit\/([^/]+)/);
  return match?.[1] ?? null;
};

export function DataModelConfigPage({ plugin }: PluginConfigPageProps<PluginMeta>) {
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const datasourceUid = useMemo(() => getDatasourceUidFromPath(window.location.pathname), []);

  return (
    <div>
      <h3>Data Model</h3>
      <p>This page will let you generate Cube data models from your database schema.</p>
      <p>Plugin ID: {plugin.meta.id}</p>
      {datasourceUid ? (
        <DatabaseTree datasourceUid={datasourceUid} selectedTables={selectedTables} onTableSelect={setSelectedTables} />
      ) : (
        <Alert title="Unable to load data model" severity="error">
          Could not determine datasource UID from URL.
        </Alert>
      )}
    </div>
  );
}
