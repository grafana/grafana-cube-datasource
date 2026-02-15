import React from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Alert, useStyles2 } from '@grafana/ui';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { CubeQuery } from '../types';

interface JsonQueryViewerProps {
  query: CubeQuery;
  reasons: string[];
}

/**
 * Read-only JSON viewer shown when the query contains features
 * that the visual builder cannot represent.
 *
 * Displays an info banner listing why JSON mode is active,
 * followed by the full query as formatted JSON.
 */
export function JsonQueryViewer({ query, reasons }: JsonQueryViewerProps) {
  const styles = useStyles2(getStyles);

  // Build a clean query object for display, omitting Grafana-internal fields
  const displayQuery = buildDisplayQuery(query);
  const json = JSON.stringify(displayQuery, null, 2);
  const highlighted = Prism.highlight(json, Prism.languages.json, 'json');

  return (
    <div data-testid="json-query-viewer">
      <Alert
        title="This query contains features not supported by the visual editor"
        severity="info"
      >
        <ul className={styles.reasonList}>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className={styles.hint}>
          To edit this query, use the dashboard JSON editor or panel JSON editor.
        </p>
      </Alert>
      <pre
        className={cx(styles.jsonDisplay, 'prism-syntax-highlight')}
        data-testid="json-query-content"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}

/**
 * Builds a display-friendly query object by extracting only the
 * Cube-relevant fields from the full CubeQuery (which also includes
 * Grafana-internal fields like refId, datasource, etc.).
 */
function buildDisplayQuery(query: CubeQuery): Record<string, unknown> {
  const display: Record<string, unknown> = {};

  if (query.dimensions?.length) {
    display.dimensions = query.dimensions;
  }
  if (query.measures?.length) {
    display.measures = query.measures;
  }
  if (query.timeDimensions?.length) {
    display.timeDimensions = query.timeDimensions;
  }
  if (query.filters?.length) {
    display.filters = query.filters;
  }
  if (query.order) {
    display.order = query.order;
  }
  if (query.limit) {
    display.limit = query.limit;
  }

  return display;
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    reasonList: css({
      margin: 0,
      paddingLeft: theme.spacing(2),
    }),
    hint: css({
      marginTop: theme.spacing(1),
      marginBottom: 0,
      color: theme.colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
    }),
    jsonDisplay: css({
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
      padding: theme.spacing(1.5),
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      backgroundColor: theme.colors.background.secondary,
      overflow: 'auto',
      maxHeight: '400px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      margin: 0,
    }),
  };
};
