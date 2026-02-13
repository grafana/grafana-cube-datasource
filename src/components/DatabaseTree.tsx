import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon } from '@grafana/ui';
import { useDbSchemaQuery } from '../queries';
import { DbSchemaResponse } from '../types';

interface DatabaseTreeProps {
  datasourceUid: string;
  selectedTables: string[];
  onTableSelect: (selectedTables: string[]) => void;
}

interface TreeNode {
  key: string;
  title: string;
  children?: TreeNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
  isIndeterminate?: boolean;
}

function convertToTreeData(
  schema: DbSchemaResponse,
  selectedTables: string[]
): TreeNode[] {
  return Object.entries(schema.tablesSchema || {}).map(([schemaName, tables]) => {
    const children = Object.keys(tables).map((tableName) => ({
      key: `${schemaName}.${tableName}`,
      title: tableName,
      isSelected: selectedTables.includes(`${schemaName}.${tableName}`),
    }));

    const selectedCount = children.filter((c) => c.isSelected).length;
    const totalCount = children.length;

    return {
      key: schemaName,
      title: schemaName,
      children,
      isExpanded: true,
      isSelected: totalCount > 0 && selectedCount === totalCount,
      isIndeterminate: selectedCount > 0 && selectedCount < totalCount,
    };
  });
}

export function DatabaseTree({ datasourceUid, selectedTables, onTableSelect }: DatabaseTreeProps) {
  const styles = useStyles2(getStyles);
  const { data, isLoading, error } = useDbSchemaQuery(datasourceUid);

  const [expandedSchemas, setExpandedSchemas] = React.useState<Record<string, boolean>>({});

  const treeData = React.useMemo(() => {
    if (!data) {
      return [];
    }
    return convertToTreeData(data, selectedTables);
  }, [data, selectedTables]);

  // Initialize expanded state when data loads
  React.useEffect(() => {
    if (treeData.length > 0 && Object.keys(expandedSchemas).length === 0) {
      const initial: Record<string, boolean> = {};
      treeData.forEach((node) => {
        initial[node.key] = true;
      });
      setExpandedSchemas(initial);
    }
  }, [treeData, expandedSchemas]);

  const handleTableClick = (tableKey: string) => {
    if (selectedTables.includes(tableKey)) {
      onTableSelect(selectedTables.filter((k) => k !== tableKey));
    } else {
      onTableSelect([...selectedTables, tableKey]);
    }
  };

  const handleSchemaToggle = (schemaKey: string) => {
    setExpandedSchemas((prev) => ({ ...prev, [schemaKey]: !prev[schemaKey] }));
  };

  const handleSchemaCheckbox = (node: TreeNode) => {
    const childKeys = node.children?.map((c) => c.key) || [];
    if (node.isSelected) {
      // Deselect all children
      onTableSelect(selectedTables.filter((k) => !childKeys.includes(k)));
    } else {
      // Select all children
      const newSelected = new Set([...selectedTables, ...childKeys]);
      onTableSelect(Array.from(newSelected));
    }
  };

  if (isLoading) {
    return (
      <div className={styles.statusContainer}>
        <Icon name="spinner" className={styles.spinner} />
        <span>Loading database schema...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.statusContainer}>
        <Icon name="exclamation-triangle" />
        <span>Failed to load database schema</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {treeData.map((schemaNode) => {
        const isExpanded = expandedSchemas[schemaNode.key] ?? true;
        return (
          <div key={schemaNode.key}>
            <div className={styles.schemaRow}>
              <span className={styles.expandIcon} onClick={() => handleSchemaToggle(schemaNode.key)}>
                <Icon name={isExpanded ? 'angle-down' : 'angle-right'} />
              </span>
              <div
                className={`${styles.checkbox} ${schemaNode.isSelected ? styles.checkboxChecked : ''} ${
                  schemaNode.isIndeterminate ? styles.checkboxIndeterminate : ''
                }`}
                onClick={() => handleSchemaCheckbox(schemaNode)}
              >
                {schemaNode.isSelected && <Icon name="check" className={styles.checkIcon} />}
                {schemaNode.isIndeterminate && <div className={styles.indeterminateLine} />}
              </div>
              <span className={styles.schemaName} onClick={() => handleSchemaToggle(schemaNode.key)}>
                {schemaNode.title}
              </span>
            </div>
            {isExpanded &&
              schemaNode.children?.map((tableNode) => (
                <div
                  key={tableNode.key}
                  className={styles.tableRow}
                  onClick={() => handleTableClick(tableNode.key)}
                >
                  <div
                    className={`${styles.checkbox} ${tableNode.isSelected ? styles.checkboxChecked : ''}`}
                  >
                    {tableNode.isSelected && <Icon name="check" className={styles.checkIcon} />}
                  </div>
                  <span className={styles.tableName}>{tableNode.title}</span>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    padding: ${theme.spacing(1)} 0;
  `,
  statusContainer: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(4)};
    color: ${theme.colors.text.secondary};
  `,
  spinner: css`
    animation: spin 1s linear infinite;
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `,
  schemaRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.5)} ${theme.spacing(1)};
    cursor: pointer;
    font-weight: ${theme.typography.fontWeightMedium};
    &:hover { background: ${theme.colors.background.secondary}; }
  `,
  tableRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.5)} ${theme.spacing(1)};
    padding-left: ${theme.spacing(5)};
    cursor: pointer;
    color: ${theme.colors.text.secondary};
    &:hover { background: ${theme.colors.background.secondary}; }
  `,
  expandIcon: css`
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${theme.colors.text.secondary};
  `,
  checkbox: css`
    width: 16px;
    height: 16px;
    border: 1px solid ${theme.colors.border.medium};
    border-radius: 3px;
    background: ${theme.colors.background.primary};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    &:hover { border-color: ${theme.colors.border.strong}; }
  `,
  checkboxChecked: css`
    background: ${theme.colors.primary.main};
    border-color: ${theme.colors.primary.main};
  `,
  checkboxIndeterminate: css`
    background: ${theme.colors.primary.main};
    border-color: ${theme.colors.primary.main};
  `,
  checkIcon: css`
    color: ${theme.colors.primary.contrastText};
    font-size: 12px;
  `,
  indeterminateLine: css`
    width: 8px;
    height: 2px;
    background: ${theme.colors.primary.contrastText};
    border-radius: 1px;
  `,
  schemaName: css`
    flex: 1;
  `,
  tableName: css`
    flex: 1;
  `,
});
