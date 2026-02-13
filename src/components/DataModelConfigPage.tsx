import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { useStyles2, Button, Alert, CodeEditor } from '@grafana/ui';
import { DatabaseTree } from './DatabaseTree';
import { FileList } from './FileList';
import { useDbSchemaQuery, useGenerateSchemaMutation, useModelFilesQuery } from '../queries';
import { ModelFile } from '../types';

/** Extract datasource UID from a URL path.
 *  Handles both /datasources/edit/{uid}/ and /datasources/edit/{uid}?page=... */
export function extractDatasourceUid(pathname: string = window.location.pathname): string | null {
  const match = pathname.match(/\/datasources\/edit\/([^/?]+)/);
  return match ? match[1] : null;
}

type ActiveTab = 'tables' | 'files';

interface DataModelConfigPageInternalProps {
  /** Override for testing -- if not provided, extracted from window.location */
  datasourceUid?: string;
}

export function DataModelConfigPage({ datasourceUid: uidOverride }: PluginConfigPageProps<PluginMeta> & DataModelConfigPageInternalProps) {
  const datasourceUid = uidOverride ?? extractDatasourceUid();
  const styles = useStyles2(getStyles);

  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('tables');
  const [selectedFile, setSelectedFile] = useState<ModelFile | null>(null);

  const dbSchemaQuery = useDbSchemaQuery(datasourceUid || '');
  const modelFilesQuery = useModelFilesQuery(datasourceUid || '');
  const generateMutation = useGenerateSchemaMutation(datasourceUid || '');

  const sortedFiles = React.useMemo(() => {
    const files = modelFilesQuery.data?.files || [];
    return [...files].sort((a, b) => {
      const typeOrder: Record<string, number> = { cubes: 0, views: 1 };
      const aOrder = typeOrder[a.fileName.split('/')[0]] ?? 2;
      const bOrder = typeOrder[b.fileName.split('/')[0]] ?? 2;
      return aOrder !== bOrder ? aOrder - bOrder : a.fileName.localeCompare(b.fileName);
    });
  }, [modelFilesQuery.data]);

  // Auto-select the first file when model files load (e.g. after generation)
  React.useEffect(() => {
    // Don't auto-select while data is being fetched (could be stale during refetch)
    if (modelFilesQuery.isFetching) {
      return;
    }
    if (sortedFiles.length > 0 && !selectedFile) {
      // Only auto-select when on the files tab
      if (activeTab === 'files') {
        setSelectedFile(sortedFiles[0]);
      }
    }
  }, [sortedFiles, selectedFile, activeTab, modelFilesQuery.isFetching]);

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

    // Switch to files tab -- the auto-select effect will pick the first file
    setSelectedFile(null);
    setActiveTab('files');
  };

  const handleFileSelect = (file: ModelFile) => {
    setSelectedFile(file);
  };

  return (
    <div className={styles.wrapper}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        {/* Tabs */}
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

        {/* Generate button (shown on tables tab) */}
        {activeTab === 'tables' && (
          <div className={styles.generateBar}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              icon={generateMutation.isPending ? 'spinner' : 'cog'}
              disabled={selectedTables.length === 0 || generateMutation.isPending}
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate Data Model'}
            </Button>
            {generateMutation.isError && (
              <Alert severity="error" title="Generation failed" className={styles.alert}>
                {String((generateMutation.error as Error)?.message || 'Unknown error')}
              </Alert>
            )}
          </div>
        )}

        {/* Tab content */}
        <div className={styles.tabContent}>
          {activeTab === 'tables' && (
            <DatabaseTree
              datasourceUid={datasourceUid}
              selectedTables={selectedTables}
              onTableSelect={setSelectedTables}
            />
          )}
          {activeTab === 'files' && (
            <FileList
              files={sortedFiles}
              selectedFile={selectedFile?.fileName}
              onFileSelect={handleFileSelect}
              isLoading={modelFilesQuery.isLoading}
              error={modelFilesQuery.error}
            />
          )}
        </div>
      </div>

      {/* Main content - Code preview */}
      <div className={styles.mainContent}>
        {selectedFile ? (
          <CodeEditor
            value={selectedFile.content}
            language="yaml"
            showMiniMap={false}
            showLineNumbers={true}
            readOnly={true}
            height="100%"
          />
        ) : (
          <div className={styles.emptyState}>
            {activeTab === 'tables'
              ? 'Select tables to generate Cube data model'
              : 'Select a file to view its contents'}
          </div>
        )}
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: flex;
    height: 500px;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    overflow: hidden;
  `,
  sidebar: css`
    width: 300px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid ${theme.colors.border.weak};
    background: ${theme.colors.background.primary};
  `,
  tabBar: css`
    display: flex;
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  tab: css`
    flex: 1;
    padding: ${theme.spacing(1)} ${theme.spacing(2)};
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: ${theme.colors.text.secondary};
    cursor: pointer;
    font-size: ${theme.typography.body.fontSize};
    &:hover { color: ${theme.colors.text.primary}; }
  `,
  tabActive: css`
    color: ${theme.colors.text.primary};
    border-bottom-color: ${theme.colors.primary.main};
  `,
  generateBar: css`
    padding: ${theme.spacing(1)} ${theme.spacing(1.5)};
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  alert: css`
    margin-top: ${theme.spacing(1)};
  `,
  tabContent: css`
    flex: 1;
    overflow: auto;
  `,
  mainContent: css`
    flex: 1;
    background: ${theme.colors.background.primary};
    display: flex;
    flex-direction: column;
  `,
  emptyState: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.body.fontSize};
  `,
});
