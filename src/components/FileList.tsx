import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon } from '@grafana/ui';
import { ModelFile } from '../types';

interface FileListProps {
  files: ModelFile[];
  isLoading: boolean;
  error: Error | null;
  selectedFile?: string;
  onFileSelect: (file: ModelFile) => void;
}

function sortFiles(files: ModelFile[]): ModelFile[] {
  return [...files].sort((a, b) => {
    const aType = a.fileName.split('/')[0];
    const bType = b.fileName.split('/')[0];
    const typeOrder: Record<string, number> = { cubes: 0, views: 1 };
    const aOrder = typeOrder[aType] ?? 2;
    const bOrder = typeOrder[bType] ?? 2;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

function getFileIcon(fileName: string): 'cube' | 'table' | 'file-alt' {
  if (fileName.includes('cubes/')) {
    return 'cube';
  }
  if (fileName.includes('views/')) {
    return 'table';
  }
  return 'file-alt';
}

export function FileList({ files, isLoading, error, selectedFile, onFileSelect }: FileListProps) {
  const styles = useStyles2(getStyles);
  const sortedFiles = sortFiles(files);

  if (isLoading) {
    return (
      <div className={styles.statusContainer}>
        <Icon name="spinner" />
        <span>Loading files...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.statusContainer}>
        <Icon name="exclamation-triangle" />
        <span>{error.message}</span>
      </div>
    );
  }

  if (sortedFiles.length === 0) {
    return (
      <div className={styles.statusContainer}>
        <Icon name="folder-open" />
        <span>No files generated yet</span>
      </div>
    );
  }

  return (
    <div className={styles.fileList}>
      {sortedFiles.map((file) => {
        const isSelected = selectedFile === file.fileName;
        return (
          <div
            key={file.fileName}
            className={`${styles.fileItem} ${isSelected ? styles.fileItemSelected : ''}`}
            onClick={() => onFileSelect(file)}
          >
            <Icon name={getFileIcon(file.fileName)} className={styles.fileIcon} />
            <span className={styles.fileName}>{file.fileName}</span>
          </div>
        );
      })}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  fileList: css`
    padding: 4px 0;
  `,
  fileItem: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: ${theme.shape.radius.default};
    margin: 2px 4px;
    &:hover {
      background: ${theme.colors.background.secondary};
    }
  `,
  fileItemSelected: css`
    background: ${theme.colors.primary.transparent};
    &:hover {
      background: ${theme.colors.primary.transparent};
    }
  `,
  fileIcon: css`
    color: ${theme.colors.text.secondary};
    flex-shrink: 0;
  `,
  fileName: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,
  statusContainer: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    color: ${theme.colors.text.secondary};
  `,
});
