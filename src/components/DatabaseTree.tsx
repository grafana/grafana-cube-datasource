import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, useStyles2 } from '@grafana/ui';
import { useDbSchemaQuery } from 'queries';

interface DatabaseTreeProps {
  datasourceUid: string;
  selectedTables?: string[];
  onTableSelect?: (tables: string[]) => void;
}

const EMPTY_TABLES: string[] = [];

export function DatabaseTree({ datasourceUid, selectedTables = EMPTY_TABLES, onTableSelect }: DatabaseTreeProps) {
  const styles = useStyles2(getStyles);
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({});
  const { data, isLoading, error } = useDbSchemaQuery(datasourceUid);

  const schemaEntries = useMemo(
    () => Object.entries(data?.tablesSchema ?? {}).map(([schemaName, tables]) => [schemaName, Object.keys(tables)] as const),
    [data]
  );

  const selectedSet = useMemo(() => new Set(selectedTables), [selectedTables]);

  if (isLoading) {
    return (
      <div className={styles.status}>
        <Icon name="spinner" className={styles.spinner} />
        <span>Loading database schema...</span>
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : 'Failed to load database schema';
    return (
      <div className={styles.status}>
        <Icon name="exclamation-triangle" />
        <span>{message}</span>
      </div>
    );
  }

  const toggleSchema = (schemaName: string) => {
    setExpandedSchemas((prev) => ({
      ...prev,
      [schemaName]: !(prev[schemaName] ?? true),
    }));
  };

  const toggleTable = (tableKey: string) => {
    if (!onTableSelect) {
      return;
    }

    if (selectedSet.has(tableKey)) {
      onTableSelect(selectedTables.filter((key) => key !== tableKey));
      return;
    }

    onTableSelect([...selectedTables, tableKey]);
  };

  const toggleSchemaSelection = (schemaName: string, tables: string[]) => {
    if (!onTableSelect) {
      return;
    }

    const schemaTableKeys = tables.map((tableName) => `${schemaName}.${tableName}`);
    const selectedCount = schemaTableKeys.filter((key) => selectedSet.has(key)).length;
    const shouldSelectAll = selectedCount < schemaTableKeys.length;

    if (!shouldSelectAll) {
      onTableSelect(selectedTables.filter((key) => !schemaTableKeys.includes(key)));
      return;
    }

    const merged = new Set([...selectedTables, ...schemaTableKeys]);
    onTableSelect(Array.from(merged));
  };

  return (
    <div className={styles.container}>
      {schemaEntries.map(([schemaName, tables]) => {
        const isExpanded = expandedSchemas[schemaName] ?? true;
        const schemaTableKeys = tables.map((tableName) => `${schemaName}.${tableName}`);
        const selectedCount = schemaTableKeys.filter((key) => selectedSet.has(key)).length;
        const isChecked = tables.length > 0 && selectedCount === tables.length;
        const isMixed = selectedCount > 0 && selectedCount < tables.length;

        return (
          <div className={styles.schemaBlock} key={schemaName}>
            <div className={styles.schemaRow}>
              <button
                type="button"
                className={styles.expandButton}
                aria-label={`Toggle schema ${schemaName}`}
                onClick={() => toggleSchema(schemaName)}
              >
                <Icon name={isExpanded ? 'angle-down' : 'angle-right'} />
              </button>
              <input
                type="checkbox"
                aria-label={`Schema ${schemaName}`}
                checked={isChecked}
                aria-checked={isMixed ? 'mixed' : isChecked ? 'true' : 'false'}
                onChange={() => toggleSchemaSelection(schemaName, tables)}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = isMixed;
                  }
                }}
              />
              <span>{schemaName}</span>
            </div>
            {isExpanded && (
              <div className={styles.tables}>
                {tables.map((tableName) => {
                  const tableKey = `${schemaName}.${tableName}`;
                  return (
                    <label key={tableKey} className={styles.tableRow}>
                      <input
                        type="checkbox"
                        aria-label={`Table ${tableKey}`}
                        checked={selectedSet.has(tableKey)}
                        onChange={() => toggleTable(tableKey)}
                      />
                      <span>{tableName}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    overflow: auto;
    max-height: 440px;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1)};
  `,
  schemaBlock: css`
    margin-bottom: ${theme.spacing(0.5)};
  `,
  schemaRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.5)} ${theme.spacing(0.5)};
  `,
  expandButton: css`
    border: none;
    background: transparent;
    color: ${theme.colors.text.secondary};
    cursor: pointer;
    padding: 0;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  `,
  tables: css`
    margin-left: ${theme.spacing(3)};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  tableRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.25)} 0;
  `,
  status: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    color: ${theme.colors.text.secondary};
    padding: ${theme.spacing(1)};
  `,
  spinner: css`
    animation: spin 1s linear infinite;

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `,
});
