import React, { useMemo, useState } from 'react';
import { PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { Alert, Button } from '@grafana/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useGenerateSchemaMutation, useModelFilesQuery } from 'queries';
import { DatabaseTree } from './DatabaseTree';
import { FileList } from './FileList';

const getDatasourceUidFromPath = (pathname: string): string | null => {
  const match = pathname.match(/\/datasources\/edit\/([^/]+)/);
  return match?.[1] ?? null;
};

export function DataModelConfigPage({ plugin }: PluginConfigPageProps<PluginMeta>) {
  const [activeTab, setActiveTab] = useState<'tables' | 'files'>('tables');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const datasourceUid = useMemo(() => getDatasourceUidFromPath(window.location.pathname), []);
  const queryClient = useQueryClient();
  const generateMutation = useGenerateSchemaMutation(datasourceUid ?? undefined);
  const { data: modelFiles, isLoading: modelFilesLoading } = useModelFilesQuery(datasourceUid ?? undefined, activeTab === 'files');

  const onGenerate = async () => {
    if (!selectedTables.length) {
      return;
    }

    try {
      setGenerateError(null);
      await generateMutation.mutateAsync(selectedTables);
      await queryClient.invalidateQueries({ queryKey: ['modelFiles', datasourceUid] });
      setActiveTab('files');
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Failed to generate data model');
    }
  };

  return (
    <div>
      <h3>Data Model</h3>
      <p>This page will let you generate Cube data models from your database schema.</p>
      <p>Plugin ID: {plugin.meta.id}</p>
      <div>
        <Button size="sm" variant={activeTab === 'tables' ? 'primary' : 'secondary'} onClick={() => setActiveTab('tables')}>
          Tables
        </Button>{' '}
        <Button size="sm" variant={activeTab === 'files' ? 'primary' : 'secondary'} onClick={() => setActiveTab('files')}>
          Files
        </Button>
      </div>
      {activeTab === 'tables' && (
        <Button
          onClick={onGenerate}
          disabled={!selectedTables.length || generateMutation.isPending}
          icon={generateMutation.isPending ? 'spinner' : 'cog'}
        >
          {generateMutation.isPending ? 'Generating...' : 'Generate Data Model'}
        </Button>
      )}
      {generateError && (
        <Alert title="Generation failed" severity="error">
          {generateError}
        </Alert>
      )}
      {datasourceUid && activeTab === 'tables' ? (
        <DatabaseTree datasourceUid={datasourceUid} selectedTables={selectedTables} onTableSelect={setSelectedTables} />
      ) : null}
      {activeTab === 'files' ? (
        modelFilesLoading ? (
          <div>Loading files...</div>
        ) : (
          <FileList
            files={modelFiles?.files ?? []}
            selectedFile={selectedFile}
            onFileSelect={(fileName) => setSelectedFile(fileName)}
          />
        )
      ) : null}
      {!datasourceUid && (
        <Alert title="Unable to load data model" severity="error">
          Could not determine datasource UID from URL.
        </Alert>
      )}
    </div>
  );
}
