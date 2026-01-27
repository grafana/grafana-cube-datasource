import React, { useMemo } from 'react';
import { Alert, CodeEditor, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { UnsupportedFeature } from '../../utils/detectUnsupportedFeatures';
import { CubeQuery } from '../../types';

export interface JsonQueryEditorProps {
  /** The query to display as JSON */
  query: CubeQuery;
  /** List of unsupported features detected in the query */
  unsupportedFeatures: UnsupportedFeature[];
}

/**
 * Read-only JSON viewer for queries that contain features the visual builder cannot handle.
 *
 * Displays an info banner explaining why the visual builder is unavailable,
 * followed by a read-only code editor showing the full query JSON.
 */
export function JsonQueryEditor({ query, unsupportedFeatures }: JsonQueryEditorProps) {
  const styles = useStyles2(getStyles);

  // Format the query as readable JSON, excluding Grafana-internal fields
  const queryJson = useMemo(() => {
    const { refId, datasource, hide, key, queryType, ...cubeQueryFields } = query as CubeQuery & {
      datasource?: unknown;
      hide?: unknown;
      key?: unknown;
      queryType?: unknown;
    };
    return JSON.stringify(cubeQueryFields, null, 2);
  }, [query]);

  const featureList = unsupportedFeatures.map((f) => (f.detail ? `${f.description}: ${f.detail}` : f.description));

  return (
    <div className={styles.container}>
      <Alert title="Advanced query features detected" severity="info">
        <p className={styles.description}>
          This query uses features that the visual builder does not support. The query configuration is shown below as
          read-only JSON.
        </p>
        <ul className={styles.featureList}>
          {featureList.map((feature, index) => (
            <li key={index}>{feature}</li>
          ))}
        </ul>
        <p className={styles.helpText}>
          To modify this query, edit the dashboard JSON directly or use an LLM to help generate valid Cube.js query
          syntax.
        </p>
      </Alert>
      <div className={styles.editorContainer}>
        <CodeEditor
          value={queryJson}
          language="json"
          height={200}
          readOnly={true}
          showMiniMap={false}
          showLineNumbers={true}
          monacoOptions={{
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  }),
  description: css({
    marginBottom: theme.spacing(1),
  }),
  featureList: css({
    marginBottom: theme.spacing(1),
    paddingLeft: theme.spacing(2),
  }),
  helpText: css({
    marginBottom: 0,
    fontStyle: 'italic',
    color: theme.colors.text.secondary,
  }),
  editorContainer: css({
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    overflow: 'hidden',
  }),
});
