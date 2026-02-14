import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Alert, Field, InlineField, Text, useStyles2 } from '@grafana/ui';
import { useCompiledSqlQuery } from 'queries';
import { DataSource } from '../datasource';
import { CubeQuery } from '../types';
import { buildCubeQueryJson } from '../utils/buildCubeQuery';
import { SQLPreview } from './SQLPreview';

interface JsonQueryViewerProps {
  query: CubeQuery;
  reasons: string[];
  datasource: DataSource;
}

export function JsonQueryViewer({ query, reasons, datasource }: JsonQueryViewerProps) {
  const styles = useStyles2(getStyles);
  const queryJson = useMemo(() => JSON.stringify(query, null, 2), [query]);
  const cubeQueryJson = useMemo(() => buildCubeQueryJson(query, datasource), [query, datasource]);

  const { data: compiledSql, isLoading: compiledSqlIsLoading } = useCompiledSqlQuery({
    datasource,
    cubeQueryJson,
  });

  return (
    <>
      <Alert severity="info" title="JSON mode is active">
        This query includes features that are not supported in the visual query builder yet.
        <ul className={styles.reasonsList}>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </Alert>

      <Field label="Query JSON" description="Read-only query payload">
        <textarea aria-label="Query JSON" className={styles.jsonViewer} value={queryJson} readOnly />
      </Field>

      {!compiledSql && compiledSqlIsLoading && (
        <InlineField label="" labelWidth={16}>
          <Text>Compiling SQL...</Text>
        </InlineField>
      )}

      <SQLPreview
        sql={compiledSql?.sql ?? ''}
        exploreSqlDatasourceUid={datasource.instanceSettings?.jsonData?.exploreSqlDatasourceUid}
      />
    </>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  reasonsList: css({
    margin: `${theme.spacing(1)} 0 0 ${theme.spacing(2)}`,
  }),
  jsonViewer: css({
    width: '100%',
    minHeight: '220px',
    resize: 'vertical',
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: theme.typography.bodySmall.fontSize,
    lineHeight: 1.5,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.primary,
    padding: theme.spacing(1),
  }),
});
