import React from 'react';
import { PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { Alert, Button } from '@grafana/ui';
import { useDbSchemaQuery, useGenerateSchemaMutation, useModelFilesQuery } from 'queries';
import { DatabaseTree } from './DatabaseTree';
import { FileList } from './FileList';

function getDatasourceUidFromLocation(pathname: string): string | null {
  const match = pathname.match(/\/datasources\/edit\/([^/]+)/);
  return match ? match[1] : null;
}

export function DataModelConfigPage({ plugin }: PluginConfigPageProps<PluginMeta>) {
  const datasourceUid = getDatasourceUidFromLocation(window.location.pathname);
  const [selectedTables, setSelectedTables] = React.useState<string[]>([]);
  const [activeTab, setActiveTab] = React.useState<'tables' | 'files'>('tables');
  const [selectedFile, setSelectedFile] = React.useState<string>();
  const [selectedFileContent, setSelectedFileContent] = React.useState<string | null>(null);
  const { data: dbSchema } = useDbSchemaQuery(datasourceUid ?? undefined);
  const generateSchemaMutation = useGenerateSchemaMutation(datasourceUid ?? undefined);
  const modelFilesQuery = useModelFilesQuery(datasourceUid ?? undefined);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  if (!datasourceUid) {
    return (
      <Alert severity="error" title="Could not load datasource UID">
        This page requires a datasource edit route.
      </Alert>
    );
  }

  const handleGenerateSchema = async () => {
    if (selectedTables.length === 0 || !dbSchema?.tablesSchema) {
      return;
    }

    const tables = selectedTables
      .map((table) => table.split('.', 2))
      .filter((parts) => parts.length === 2) as string[][];

    try {
      setErrorMessage(null);
      await generateSchemaMutation.mutateAsync({
        format: 'yaml',
        tables,
        tablesSchema: dbSchema.tablesSchema,
      });
      setActiveTab('files');
      const modelFilesResponse = await modelFilesQuery.refetch();
      const firstFile = modelFilesResponse.data?.files?.[0];
      if (firstFile) {
        setSelectedFile(firstFile.fileName);
        setSelectedFileContent(firstFile.content);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate schema');
    }
  };

  return (
    <div>
      <h3>Data Model</h3>
      <p>This page will let you generate Cube data models from your database schema.</p>
      <p>Plugin ID: {plugin.meta.id}</p>
      {errorMessage ? (
        <Alert severity="error" title="Generate failed">
          {errorMessage}
        </Alert>
      ) : null}
      <div>
        <Button variant={activeTab === 'tables' ? 'primary' : 'secondary'} onClick={() => setActiveTab('tables')}>
          Tables
        </Button>
        <Button variant={activeTab === 'files' ? 'primary' : 'secondary'} onClick={() => setActiveTab('files')}>
          Files
        </Button>
      </div>
      <Button
        variant="primary"
        onClick={handleGenerateSchema}
        disabled={selectedTables.length === 0 || generateSchemaMutation.isPending}
      >
        {generateSchemaMutation.isPending ? 'Generating...' : 'Generate Data Model'}
      </Button>
      {activeTab === 'tables' ? (
        <DatabaseTree datasourceUid={datasourceUid} selectedTables={selectedTables} onTableSelect={setSelectedTables} />
      ) : (
        <FileList
          files={modelFilesQuery.data?.files ?? []}
          selectedFile={selectedFile}
          onFileSelect={(fileName, content) => {
            setSelectedFile(fileName);
            setSelectedFileContent(content);
          }}
        />
      )}
      {selectedFileContent ? <pre>{selectedFileContent}</pre> : null}
    </div>
  );
}
