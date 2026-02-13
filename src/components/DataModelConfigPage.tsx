import React, { useMemo, useState } from 'react';
import { PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { Alert, Button } from '@grafana/ui';
import { useGenerateSchemaMutation } from 'queries';
import { DatabaseTree } from './DatabaseTree';

const getDatasourceUidFromPath = (pathname: string): string | null => {
  const match = pathname.match(/\/datasources\/edit\/([^/]+)/);
  return match?.[1] ?? null;
};

export function DataModelConfigPage({ plugin }: PluginConfigPageProps<PluginMeta>) {
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const datasourceUid = useMemo(() => getDatasourceUidFromPath(window.location.pathname), []);
  const generateMutation = useGenerateSchemaMutation(datasourceUid ?? undefined);

  const onGenerate = async () => {
    if (!selectedTables.length) {
      return;
    }

    try {
      setGenerateError(null);
      await generateMutation.mutateAsync(selectedTables);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Failed to generate data model');
    }
  };

  return (
    <div>
      <h3>Data Model</h3>
      <p>This page will let you generate Cube data models from your database schema.</p>
      <p>Plugin ID: {plugin.meta.id}</p>
      <Button
        onClick={onGenerate}
        disabled={!selectedTables.length || generateMutation.isPending}
        icon={generateMutation.isPending ? 'spinner' : 'cog'}
      >
        {generateMutation.isPending ? 'Generating...' : 'Generate Data Model'}
      </Button>
      {generateError && (
        <Alert title="Generation failed" severity="error">
          {generateError}
        </Alert>
      )}
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
