import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { useStyles2, Button, Alert, CodeEditor, Icon, Badge, LinkButton } from '@grafana/ui';
import { DatabaseTree, decodeTableKey } from './DatabaseTree';
import { FileList, sortFiles } from './FileList';
import { useDbSchemaQuery, useGenerateSchemaMutation, useModelFilesQuery } from '../queries';
import { ModelFile } from '../types';

/**
 * Extract datasource UID from the current URL.
 * URL pattern: /connections/datasources/edit/{uid}/?page=data-model
 * The regex excludes '?' so query params aren't captured when there's no trailing slash.
 */
export function extractDatasourceUid(pathname = window.location.pathname): string | null {
  const match = pathname.match(/\/datasources\/edit\/([^/?]+)/);
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

    const tables = selectedTables.map((key) => decodeTableKey(key));

    try {
      await generateMutation.mutateAsync({
        format: 'yaml',
        tables,
        tablesSchema: dbSchemaQuery.data.tablesSchema,
      });

      // Switch to files tab and select the first file in sorted (visible) order
      setActiveTab('files');
      const result = await modelFilesQuery.refetch();
      if (result.data?.files?.length) {
        const sorted = sortFiles(result.data.files);
        setSelectedFile(sorted[0]);
      } else {
        // Clear stale selection when generation produces no files
        setSelectedFile(null);
      }
    } catch {
      // Error is captured by mutation state and displayed in the UI
    }
  };

  const handleFileSelect = (file: ModelFile) => {
    setSelectedFile(file);
  };

  const fileCount = modelFilesQuery.data?.files?.length || 0;

  return (
    <>
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
              {selectedTables.length > 0 && (
                <Badge text={String(selectedTables.length)} color="blue" className={styles.badge} />
              )}
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'files' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('files')}
              type="button"
            >
              Files
              {fileCount > 0 && <Badge text={String(fileCount)} color="green" className={styles.badge} />}
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
                fullWidth
              >
                {generateMutation.isPending ? 'Generating...' : `Generate Data Model (${selectedTables.length})`}
              </Button>
            </div>
          )}

          {generateMutation.isError && (
            <div className={styles.errorContainer}>
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
            <>
              <div className={styles.fileHeader}>
                <Icon name="file-alt" className={styles.fileHeaderIcon} />
                <span className={styles.fileHeaderName}>{selectedFile.fileName}</span>
              </div>
              <div className={styles.codeEditorWrapper}>
                <CodeEditor
                  value={selectedFile.content}
                  language="yaml"
                  showMiniMap={false}
                  showLineNumbers={true}
                  readOnly={true}
                  height="464px"
                />
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <Icon name="cube" size="xxxl" className={styles.emptyStateIcon} />
              <h4 className={styles.emptyStateTitle}>
                {activeTab === 'tables' ? 'Generate Data Models' : 'Preview Files'}
              </h4>
              <p className={styles.emptyStateText}>
                {activeTab === 'tables'
                  ? 'Select tables from the sidebar and click "Generate Data Model" to create Cube data model files.'
                  : 'Select a file from the sidebar to preview its YAML contents.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {generateMutation.isSuccess && fileCount > 0 && (
        <Alert severity="success" title="Data model generated successfully" className={styles.successAlert}>
          Next, you can start to visualize data by{' '}
          <LinkButton variant="primary" size="sm" fill="text" href="/dashboard/new">
            building a dashboard
          </LinkButton>
          , or by querying data in the{' '}
          <LinkButton
            variant="primary"
            size="sm"
            fill="text"
            href={`/explore?left=${encodeURIComponent(JSON.stringify({ datasource: datasourceUid }))}`}
          >
            Explore view
          </LinkButton>
          .
        </Alert>
      )}
    </>
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
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
  badge: css`
    font-size: 10px;
    padding: 0 4px;
    height: 16px;
    line-height: 16px;
  `,
  generateContainer: css`
    padding: ${theme.spacing(1)} ${theme.spacing(1.5)};
    border-bottom: 1px solid ${theme.colors.border.weak};
    flex-shrink: 0;
  `,
  errorContainer: css`
    padding: ${theme.spacing(1)};
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
  fileHeader: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: ${theme.spacing(1)} ${theme.spacing(2)};
    border-bottom: 1px solid ${theme.colors.border.weak};
    background: ${theme.colors.background.secondary};
    flex-shrink: 0;
  `,
  fileHeaderIcon: css`
    color: ${theme.colors.text.secondary};
  `,
  fileHeaderName: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    font-family: ${theme.typography.fontFamilyMonospace};
    color: ${theme.colors.text.primary};
  `,
  codeEditorWrapper: css`
    flex: 1;
    overflow: hidden;
  `,
  emptyState: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: ${theme.colors.text.secondary};
    padding: ${theme.spacing(4)};
    text-align: center;
  `,
  emptyStateIcon: css`
    color: ${theme.colors.text.disabled};
    margin-bottom: ${theme.spacing(2)};
  `,
  emptyStateTitle: css`
    color: ${theme.colors.text.primary};
    margin: 0 0 ${theme.spacing(1)} 0;
  `,
  emptyStateText: css`
    max-width: 400px;
    line-height: 1.5;
  `,
  successAlert: css`
    margin-top: ${theme.spacing(2)};
  `,
});
