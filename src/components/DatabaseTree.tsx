import React, { useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon } from '@grafana/ui';
import { useDbSchemaQuery } from '../queries';
import { DbSchemaResponse } from '../types';

interface DatabaseTreeProps {
  datasourceUid: string;
  onTableSelect: (selectedTables: string[]) => void;
  selectedTables: string[];
}

interface TreeNode {
  key: string;
  title: string;
  children?: TreeNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
  isIndeterminate?: boolean;
}

function convertToTreeData(schema: DbSchemaResponse, selectedTables: string[]): TreeNode[] {
  return Object.entries(schema.tablesSchema || {}).map(([schemaName, tables]) => {
    const children = Object.keys(tables).map((tableName) => ({
      key: `${schemaName}.${tableName}`,
      title: tableName,
      isSelected: selectedTables.includes(`${schemaName}.${tableName}`),
    }));

    const selectedCount = children.filter((c) => c.isSelected).length;

    return {
      key: schemaName,
      title: schemaName,
      children,
      isExpanded: true,
      isSelected: selectedCount === children.length && children.length > 0,
      isIndeterminate: selectedCount > 0 && selectedCount < children.length,
    };
  });
}

export function DatabaseTree({ datasourceUid, onTableSelect, selectedTables }: DatabaseTreeProps) {
  const { data, isLoading, error } = useDbSchemaQuery(datasourceUid);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const styles = useStyles2(getStyles);

  // Auto-expand all schemas on first load
  useEffect(() => {
    if (data && !initialized) {
      setExpandedSchemas(new Set(Object.keys(data.tablesSchema || {})));
      setInitialized(true);
    }
  }, [data, initialized]);

  const treeData = data ? convertToTreeData(data, selectedTables) : [];

  // Override expansion state from our local state
  const nodes = treeData.map((node) => ({
    ...node,
    isExpanded: expandedSchemas.has(node.key),
  }));

  const handleNodeClick = useCallback(
    (node: TreeNode, isChild: boolean) => {
      if (isChild) {
        const newSelected = node.isSelected
          ? selectedTables.filter((key) => key !== node.key)
          : [...selectedTables, node.key];
        onTableSelect(newSelected);
      } else {
        setExpandedSchemas((prev) => {
          const next = new Set(prev);
          if (next.has(node.key)) {
            next.delete(node.key);
          } else {
            next.add(node.key);
          }
          return next;
        });
      }
    },
    [selectedTables, onTableSelect]
  );

  const renderCheckbox = (node: TreeNode, isChild: boolean) => {
    if (isChild) {
      return (
        <div className={`${styles.checkbox} ${node.isSelected ? styles.checkboxChecked : ''}`}>
          {node.isSelected && <Icon name="check" className={styles.checkIcon} />}
        </div>
      );
    }
    return (
      <div
        className={`${styles.checkbox} ${node.isSelected ? styles.checkboxChecked : ''} ${
          node.isIndeterminate ? styles.checkboxIndeterminate : ''
        }`}
      >
        {node.isSelected && <Icon name="check" className={styles.checkIcon} />}
        {node.isIndeterminate && <div className={styles.indeterminateLine} />}
      </div>
    );
  };

  const renderNode = (node: TreeNode, isChild = false, level = 0) => {
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.key} className={styles.treeNode}>
        <div
          className={`${styles.nodeContent} ${isChild ? styles.childNode : styles.parentNode}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleNodeClick(node, isChild)}
        >
          {!isChild && hasChildren && (
            <Icon name={node.isExpanded ? 'angle-down' : 'angle-right'} className={styles.expandIcon} />
          )}
          {!isChild && !hasChildren && <div className={styles.expandIconSpacer} />}

          {renderCheckbox(node, isChild)}

          <span className={styles.nodeTitle}>{node.title}</span>
        </div>

        {!isChild && hasChildren && node.isExpanded && (
          <div className={styles.childrenContainer}>
            {node.children!.map((child) => renderNode(child, true, level + 1))}
          </div>
        )}
      </div>
    );
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
        <span>{error instanceof Error ? error.message : 'Failed to load database schema'}</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.treeContainer}>{nodes.map((node) => renderNode(node))}</div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    width: 100%;
    height: 100%;
    overflow: auto;
  `,
  treeContainer: css`
    padding: 4px 0;
  `,
  treeNode: css`
    user-select: none;
  `,
  nodeContent: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    cursor: pointer;
    &:hover {
      background: ${theme.colors.background.secondary};
    }
  `,
  parentNode: css`
    font-weight: ${theme.typography.fontWeightMedium};
    color: ${theme.colors.text.primary};
  `,
  childNode: css`
    font-weight: ${theme.typography.fontWeightRegular};
    color: ${theme.colors.text.secondary};
  `,
  expandIcon: css`
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${theme.colors.text.secondary};
  `,
  expandIconSpacer: css`
    width: 16px;
    height: 16px;
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
    cursor: pointer;
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
  nodeTitle: css`
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,
  childrenContainer: css`
    margin-left: 16px;
  `,
  statusContainer: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    color: ${theme.colors.text.secondary};
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
