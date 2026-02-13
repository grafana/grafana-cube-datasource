import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, useStyles2 } from '@grafana/ui';
import { ModelFile } from 'types';

interface FileListProps {
  files: ModelFile[];
  selectedFile?: string;
  onFileSelect?: (fileName: string, content: string) => void;
}

const typeOrder: Record<string, number> = {
  cubes: 0,
  views: 1,
};

const sortFiles = (files: ModelFile[]) => {
  return [...files].sort((a, b) => {
    const aType = a.fileName.split('/')[0] ?? 'other';
    const bType = b.fileName.split('/')[0] ?? 'other';
    const aOrder = typeOrder[aType] ?? 2;
    const bOrder = typeOrder[bType] ?? 2;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.fileName.localeCompare(b.fileName);
  });
};

export function FileList({ files, selectedFile, onFileSelect }: FileListProps) {
  const styles = useStyles2(getStyles);
  const sortedFiles = useMemo(() => sortFiles(files), [files]);

  if (!sortedFiles.length) {
    return (
      <div className={styles.emptyState}>
        <Icon name="folder-open" />
        <span>No files generated yet</span>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {sortedFiles.map((file) => {
        const isSelected = selectedFile === file.fileName;
        return (
          <button
            type="button"
            key={file.fileName}
            className={`${styles.item} ${isSelected ? styles.selected : ''}`}
            onClick={() => onFileSelect?.(file.fileName, file.content)}
            aria-label={`Open ${file.fileName}`}
          >
            <Icon name="file-alt" />
            <span data-testid="file-item-name">{file.fileName}</span>
          </button>
        );
      })}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  list: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  item: css`
    display: flex;
    gap: ${theme.spacing(1)};
    align-items: center;
    text-align: left;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(0.75)};
    background: ${theme.colors.background.primary};
    cursor: pointer;
    color: ${theme.colors.text.primary};
  `,
  selected: css`
    border-color: ${theme.colors.primary.main};
    background: ${theme.colors.primary.transparent};
  `,
  emptyState: css`
    display: flex;
    gap: ${theme.spacing(1)};
    align-items: center;
    color: ${theme.colors.text.secondary};
  `,
});
