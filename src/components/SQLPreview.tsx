import React from 'react';
import { css, cx } from '@emotion/css';
import { EditorFieldGroup, EditorRow } from '@grafana/plugin-ui';
import { GrafanaTheme2 } from '@grafana/data';
import { Alert, LinkButton, useTheme2 } from '@grafana/ui';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import { useDatasourceQuery } from '../queries';
import { CubeFilter } from '../types';

interface SQLPreviewProps {
  sql: string;
  exploreSqlDatasourceUid?: string;
  /**
   * AdHoc filters dropped because they target a different Cube view than this
   * query. Surfaced as a hint so users understand why a dashboard filter did
   * not apply to this panel (issue #307).
   */
  droppedAdHocFilters?: CubeFilter[];
}

export function SQLPreview({ sql, exploreSqlDatasourceUid, droppedAdHocFilters = [] }: SQLPreviewProps) {
  const theme = useTheme2();
  const styles = getStyles(theme);

  const { data: targetDatasource, isPending } = useDatasourceQuery(exploreSqlDatasourceUid);

  const droppedHint =
    droppedAdHocFilters.length > 0 ? (
      <Alert
        severity="info"
        title={`Skipped ${droppedAdHocFilters.length} inapplicable AdHoc filter${
          droppedAdHocFilters.length === 1 ? '' : 's'
        }`}
      >
        {`These dashboard filters target a different Cube view and were not applied to this panel: ${droppedAdHocFilters
          .map((f) => f.member)
          .join(', ')}`}
      </Alert>
    ) : null;

  if (!sql) {
    // Still surface the skipped-filters hint even when there is no SQL to show.
    return droppedHint;
  }

  const highlighted = Prism.highlight(sql, Prism.languages.sql, 'sql');

  // Construct Explore URL with the configured SQL datasource
  // If no datasource is configured, link to Explore without pre-selecting one
  const constructExploreUrl = (sqlQuery: string): string => {
    const exploreState: Record<string, unknown> = {
      queries: [
        {
          refId: 'A',
          rawSql: sqlQuery,
          // Omit 'format' field to let each datasource use its default format
          // Different datasources expect different types (string vs numeric enum)
          rawQuery: true,
          ...(targetDatasource && {
            datasource: {
              type: targetDatasource.type,
              uid: targetDatasource.uid,
            },
          }),
        },
      ],
      range: {
        from: 'now-1h',
        to: 'now',
      },
    };

    // Only add top-level datasource if we have one configured
    if (targetDatasource) {
      exploreState.datasource = {
        type: targetDatasource.type,
        uid: targetDatasource.uid,
      };
    }

    return `/explore?left=${encodeURIComponent(JSON.stringify(exploreState))}`;
  };

  const exploreUrl = constructExploreUrl(sql);

  return (
    <EditorRow>
      <EditorFieldGroup>
        {droppedHint}
        <div className={styles.container}>
          <div
            className={cx(styles.sqlDisplay, 'prism-syntax-highlight')}
            aria-label="Generated SQL query"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
          {exploreSqlDatasourceUid && (
            <div className={styles.buttonContainer}>
              <LinkButton
                variant="secondary"
                size="sm"
                icon={isPending ? 'spinner' : 'compass'}
                href={exploreUrl}
                disabled={isPending}
              >
                Edit SQL in Explore
              </LinkButton>
            </div>
          )}
        </div>
      </EditorFieldGroup>
    </EditorRow>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    container: css({
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      backgroundColor: theme.colors.background.secondary,
      overflow: 'hidden',
    }),
    sqlDisplay: css({
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
      padding: theme.spacing(1),
      overflow: 'auto',
      maxHeight: '200px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }),
    buttonContainer: css({
      padding: theme.spacing(1),
      paddingTop: 0,
      textAlign: 'left',
    }),
  };
};
