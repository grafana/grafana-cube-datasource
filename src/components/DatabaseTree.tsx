import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, useStyles2 } from '@grafana/ui';
import { useDbSchemaQuery } from 'queries';

interface TreeNode {
  key: string;
  title: string;
  children?: TreeNode[];
  isExpanded?: boolean;
  isSelected?: boolean;
  isIndeterminate?: boolean;
}

interface DatabaseTreeProps {
  datasourceUid: string;
  selectedTables: string[];
  onTableSelect: (selectedTables: string[]) => void;
}

function updateSelectionState(nodes: TreeNode[], selectedTables: string[]): TreeNode[] {
  return nodes.map((node) => {
    const children =
      node.children?.map((child) => ({
        ...child,
        isSelected: selectedTables.includes(child.key),
      })) ?? [];

    const selectedChildren = children.filter((child) => child.isSelected).length;
    const totalChildren = children.length;

    return {
      ...node,
      children,
      isSelected: totalChildren > 0 && selectedChildren === totalChildren,
      isIndeterminate: selectedChildren > 0 && selectedChildren < totalChildren,
    };
  });
}

export function DatabaseTree({ datasourceUid, selectedTables, onTableSelect }: DatabaseTreeProps) {
  const styles = useStyles2(getStyles);
  const { data, isLoading, error } = useDbSchemaQuery(datasourceUid);
  const baseTree = useMemo(() => {
    const tablesSchema = data?.tablesSchema ?? {};

    return Object.entries(tablesSchema).map(([schemaName, tables]) => ({
      key: schemaName,
      title: schemaName,
      isExpanded: true,
      children: Object.keys(tables).map((tableName) => ({
        key: `${schemaName}\0${tableName}`,
        title: tableName,
      })),
    }));
  }, [data]);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const treeData = useMemo(() => {
    const withExpandedState = baseTree.map((node) => ({
      ...node,
      isExpanded: expandedKeys[node.key] ?? true,
    }));
    return updateSelectionState(withExpandedState, selectedTables);
  }, [baseTree, expandedKeys, selectedTables]);

  const toggleNode = (node: TreeNode, isChild: boolean) => {
    if (isChild) {
      const nextSelectedTables = node.isSelected
        ? selectedTables.filter((table) => table !== node.key)
        : [...selectedTables, node.key];
      onTableSelect(nextSelectedTables);
      return;
    }

    setExpandedKeys((prev) => ({
      ...prev,
      [node.key]: !(prev[node.key] ?? true),
    }));
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Icon name="spinner" className={styles.spinner} />
          <span>Loading database schema...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <Icon name="exclamation-triangle" />
          <span>{error.message}</span>
        </div>
      </div>
    );
  }

  const renderNode = (node: TreeNode, isChild = false, level = 0) => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = node.isExpanded ?? false;

    return (
      <div key={node.key} className={styles.treeNode}>
        <button
          type="button"
          className={`${styles.nodeContent} ${isChild ? styles.childNode : styles.parentNode}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => toggleNode(node, isChild)}
        >
          {!isChild && hasChildren ? (
            <Icon name={isExpanded ? 'angle-down' : 'angle-right'} className={styles.expandIcon} />
          ) : (
            <div className={styles.expandIcon} />
          )}
          <div
            className={`${styles.checkbox} ${node.isSelected ? styles.checkboxChecked : ''} ${
              node.isIndeterminate ? styles.checkboxIndeterminate : ''
            }`}
          >
            {node.isSelected && <Icon name="check" className={styles.checkIcon} />}
            {node.isIndeterminate && <div className={styles.indeterminateLine} />}
          </div>
          <span className={styles.nodeTitle}>{node.title}</span>
        </button>

        {!isChild && hasChildren && isExpanded ? (
          <div className={styles.childrenContainer}>{node.children?.map((child) => renderNode(child, true, level + 1))}</div>
        ) : null}
      </div>
    );
  };

  return <div className={styles.container}>{treeData.map((node) => renderNode(node))}</div>;
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    width: 100%;
    height: 100%;
    overflow: auto;
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
    width: 100%;
    border: none;
    background: transparent;
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
    display: flex;
    justify-content: center;
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
    text-align: left;
  `,
  childrenContainer: css`
    margin-left: 16px;
  `,
  loading: css`
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
  error: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    color: ${theme.colors.error.text};
  `,
});
