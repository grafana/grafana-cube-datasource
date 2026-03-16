import React, { useState } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, Text, useStyles2 } from '@grafana/ui';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import { CubeQuery } from '../types';

interface UnsupportedFieldsViewerProps {
  query: CubeQuery;
  unsupportedKeys: Set<string>;
  reasons: string[];
}

/**
 * Compact read-only JSON viewer shown inline below the visual editor
 * when the query contains features the visual builder cannot represent.
 *
 * Unlike the former JsonQueryViewer which showed the full query,
 * this component extracts and displays only the unsupported keys.
 * The JSON block is collapsed by default to save vertical space.
 */
export function UnsupportedFieldsViewer({ query, unsupportedKeys, reasons }: UnsupportedFieldsViewerProps) {
  const styles = useStyles2(getStyles);
  const [isExpanded, setIsExpanded] = useState(false);

  const unsupportedFields = extractUnsupportedFields(query, unsupportedKeys);

  if (Object.keys(unsupportedFields).length === 0) {
    return null;
  }

  const json = JSON.stringify(unsupportedFields, null, 2);
  const highlighted = Prism.highlight(json, Prism.languages.json, 'json');

  return (
    <div className={styles.container} data-testid="unsupported-fields-viewer">
      <div className={styles.header}>
        <Icon name="info-circle" size="sm" />
        <Text weight="medium">Additional query configuration</Text>
        <Text color="secondary" italic variant="bodySmall">
          — read-only, edit via{' '}
          <a
            href="https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/view-dashboard-json-model/"
            target="_blank"
            rel="noopener noreferrer"
          >
            panel JSON
          </a>
        </Text>
      </div>
      <ul className={styles.reasonList}>
        {reasons.map((reason) => (
          <li key={reason}>
            <Text color="secondary" variant="bodySmall">
              {reason}
            </Text>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        data-testid="unsupported-fields-toggle"
      >
        <Icon name={isExpanded ? 'angle-down' : 'angle-right'} size="sm" />
        <Text variant="bodySmall" color="secondary">
          {isExpanded ? 'Hide' : 'Show'} JSON
        </Text>
      </button>
      {isExpanded && (
        <pre
          className={cx(styles.jsonDisplay, 'prism-syntax-highlight')}
          data-testid="unsupported-fields-content"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      )}
    </div>
  );
}

/**
 * Extracts only the unsupported keys from the query for display.
 */
function extractUnsupportedFields(query: CubeQuery, unsupportedKeys: Set<string>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const queryRecord = query as unknown as Record<string, unknown>;

  for (const key of unsupportedKeys) {
    const value = queryRecord[key];
    if (value !== undefined && value !== null) {
      fields[key] = value;
    }
  }

  return fields;
}

/**
 * maxHeight is set to a non-integer multiple of the line height so the
 * last visible line is clipped in half, hinting that more content is
 * available via scrolling. Uses em-relative units so it adapts to the
 * actual rendered font size rather than a hardcoded pixel value.
 */
const LINE_HEIGHT = 1.5;
const VISIBLE_LINES = 6.5;

const getStyles = (theme: GrafanaTheme2) => {
  return {
    container: css({
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      backgroundColor: theme.colors.background.secondary,
      padding: theme.spacing(1.5),
      marginBottom: theme.spacing(1),
    }),
    header: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.75),
      marginBottom: theme.spacing(0.5),
    }),
    reasonList: css({
      margin: 0,
      marginBottom: theme.spacing(0.75),
      paddingLeft: theme.spacing(2),
      '& li': {
        marginBottom: theme.spacing(0.25),
      },
    }),
    toggleButton: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.5),
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing(0.5),
      '&:hover': {
        color: theme.colors.text.primary,
      },
    }),
    jsonDisplay: css({
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
      lineHeight: LINE_HEIGHT,
      padding: theme.spacing(1),
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      backgroundColor: theme.colors.background.primary,
      overflowY: 'scroll',
      overflowX: 'auto',
      maxHeight: `${VISIBLE_LINES * LINE_HEIGHT}em`,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      margin: 0,
    }),
  };
};
