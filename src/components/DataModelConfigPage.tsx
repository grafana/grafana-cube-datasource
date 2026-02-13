import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { Alert, Button, CodeEditor, useStyles2 } from '@grafana/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useGenerateSchemaMutation, useModelFilesQuery } from 'queries';
import { DatabaseTree } from './DatabaseTree';
import { FileList } from './FileList';

const getDatasourceUidFromPath = (pathname: string): string | null => {
  const match = pathname.match(/\/datasources\/edit\/([^/]+)/);
  return match?.[1] ?? null;
};

export function DataModelConfigPage({ plugin }: PluginConfigPageProps<PluginMeta>) {
  const styles = useStyles2(getStyles);
  const [activeTab, setActiveTab] = useState<'tables' | 'files'>('tables');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [yamlPreview, setYamlPreview] = useState<string>('# Select a generated file to preview its YAML content');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const datasourceUid = useMemo(() => getDatasourceUidFromPath(window.location.pathname), []);
  const queryClient = useQueryClient();
  const generateMutation = useGenerateSchemaMutation(datasourceUid ?? undefined);
  const { data: modelFiles, isLoading: modelFilesLoading, error: modelFilesError } = useModelFilesQuery(
    datasourceUid ?? undefined,
    activeTab === 'files'
  );

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
    <div className={styles.page}>
      <div className={styles.sidebar}>
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
          ) : modelFilesError ? (
            <Alert title="Failed to load model files" severity="error">
              {modelFilesError instanceof Error ? modelFilesError.message : 'Unknown error'}
            </Alert>
          ) : (
            <FileList
              files={modelFiles?.files ?? []}
              selectedFile={selectedFile}
              onFileSelect={(fileName, content) => {
                setSelectedFile(fileName);
                setYamlPreview(content);
              }}
            />
          )
        ) : null}
        {!datasourceUid && (
          <Alert title="Unable to load data model" severity="error">
            Could not determine datasource UID from URL.
          </Alert>
        )}
      </div>
      <div className={styles.preview}>
        <CodeEditor value={yamlPreview} language="yaml" showMiniMap={false} showLineNumbers={true} readOnly={true} />
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  page: css`
    display: flex;
    gap: ${theme.spacing(2)};
    min-height: 500px;
  `,
  sidebar: css`
    width: 360px;
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  preview: css`
    flex: 1;
    min-width: 0;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    overflow: hidden;
  `,
});
