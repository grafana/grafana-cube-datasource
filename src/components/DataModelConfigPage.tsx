import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { useStyles2, Button, Alert, CodeEditor } from '@grafana/ui';
import { DatabaseTree } from './DatabaseTree';
import { FileList } from './FileList';
import { useDbSchemaQuery, useGenerateSchemaMutation, useModelFilesQuery } from '../queries';
import { ModelFile } from '../types';

/**
 * Extract datasource UID from the current URL.
 * URL pattern: /connections/datasources/edit/{uid}/?page=data-model
 */
export function extractDatasourceUid(pathname = window.location.pathname): string | null {
  const match = pathname.match(/\/datasources\/edit\/([^/]+)/);
  return match ? match[1] : null;
}

export function DataModelConfigPage(_props: PluginConfigPageProps<PluginMeta>) {
  const datasourceUid = extractDatasourceUid();
  const styles = useStyles2(getStyles);

  const [activeTab, setActiveTab] = useState<'tables' | 'files'>('tables');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<ModelFile | null>(null);

  const dbSchemaQuery = useDbSchemaQuery(datasourceUid || '');
  const modelFilesQuery = useModelFilesQuery(datasourceUid || '');
  const generateMutation = useGenerateSchemaMutation(datasourceUid || '');

  if (!datasourceUid) {
    return <Alert severity="error" title="Unable to determine datasource" />;
  }

  const handleGenerate = async () => {
    if (selectedTables.length === 0 || !dbSchemaQuery.data) {
      return;
    }

    const tables = selectedTables.map((key) => key.split('.'));

    await generateMutation.mutateAsync({
      format: 'yaml',
      tables,
      tablesSchema: dbSchemaQuery.data.tablesSchema,
    });

    // Switch to files tab and select first file after refetch
    setActiveTab('files');
    const result = await modelFilesQuery.refetch();
    if (result.data?.files?.length) {
      setSelectedFile(result.data.files[0]);
    }
  };

  const handleFileSelect = (file: ModelFile) => {
    setSelectedFile(file);
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        {/* Tab bar */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tab} ${activeTab === 'tables' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('tables')}
            type="button"
          >
            Tables
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'files' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('files')}
            type="button"
          >
            Files
          </button>
        </div>

        {/* Generate button (only on tables tab) */}
        {activeTab === 'tables' && (
          <div className={styles.generateContainer}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              icon={generateMutation.isPending ? 'spinner' : 'cog'}
              disabled={selectedTables.length === 0 || generateMutation.isPending}
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate Data Model'}
            </Button>
          </div>
        )}

        {generateMutation.isError && (
          <div className={styles.generateContainer}>
            <Alert severity="error" title="Generation failed">
              {generateMutation.error instanceof Error
                ? generateMutation.error.message
                : 'An error occurred while generating the data model.'}
            </Alert>
          </div>
        )}

        {/* Tab content */}
        <div className={styles.tabContent}>
          {activeTab === 'tables' && (
            <DatabaseTree
              datasourceUid={datasourceUid}
              onTableSelect={setSelectedTables}
              selectedTables={selectedTables}
            />
          )}
          {activeTab === 'files' && (
            <FileList
              files={modelFilesQuery.data?.files || []}
              isLoading={modelFilesQuery.isLoading}
              error={modelFilesQuery.error}
              selectedFile={selectedFile?.fileName}
              onFileSelect={handleFileSelect}
            />
          )}
        </div>
      </div>

      {/* Main content - YAML preview */}
      <div className={styles.mainContent}>
        {selectedFile ? (
          <div className={styles.codeEditorWrapper}>
            <CodeEditor
              value={selectedFile.content}
              language="yaml"
              showMiniMap={false}
              showLineNumbers={true}
              readOnly={true}
              height="498px"
            />
          </div>
        ) : (
          <div className={styles.emptyState}>
            {activeTab === 'tables'
              ? 'Select tables and click "Generate Data Model" to create Cube data models.'
              : 'Select a file to view its contents.'}
          </div>
        )}
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    height: 500px;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    overflow: hidden;
  `,
  sidebar: css`
    width: 300px;
    min-width: 300px;
    border-right: 1px solid ${theme.colors.border.weak};
    display: flex;
    flex-direction: column;
    background: ${theme.colors.background.primary};
  `,
  tabBar: css`
    display: flex;
    border-bottom: 1px solid ${theme.colors.border.weak};
    flex-shrink: 0;
  `,
  tab: css`
    flex: 1;
    background: none;
    border: none;
    padding: ${theme.spacing(1)} ${theme.spacing(2)};
    font-size: ${theme.typography.body.fontSize};
    color: ${theme.colors.text.secondary};
    cursor: pointer;
    position: relative;
    &:hover {
      color: ${theme.colors.text.primary};
    }
  `,
  tabActive: css`
    color: ${theme.colors.text.primary};
    &::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: ${theme.colors.primary.main};
    }
  `,
  generateContainer: css`
    padding: ${theme.spacing(1)} ${theme.spacing(2)};
    border-bottom: 1px solid ${theme.colors.border.weak};
    flex-shrink: 0;
  `,
  tabContent: css`
    flex: 1;
    overflow: auto;
  `,
  mainContent: css`
    flex: 1;
    display: flex;
    flex-direction: column;
    background: ${theme.colors.background.primary};
    min-width: 0;
  `,
  codeEditorWrapper: css`
    flex: 1;
    overflow: hidden;
  `,
  emptyState: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: ${theme.colors.text.secondary};
    padding: ${theme.spacing(4)};
    text-align: center;
  `,
});
