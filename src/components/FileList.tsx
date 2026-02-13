import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon } from '@grafana/ui';
import { ModelFile } from '../types';

interface FileListProps {
  files: ModelFile[];
  selectedFile?: string;
  onFileSelect: (file: ModelFile) => void;
  isLoading?: boolean;
  error?: Error | null;
}

function getFileIcon(fileName: string): 'cube' | 'table' | 'file-alt' {
  if (fileName.startsWith('cubes/')) {
    return 'cube';
  }
  if (fileName.startsWith('views/')) {
    return 'table';
  }
  return 'file-alt';
}

export function FileList({ files, selectedFile, onFileSelect, isLoading, error }: FileListProps) {
  const styles = useStyles2(getStyles);

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
        <span>Failed to load model files</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className={styles.statusContainer}>
        <Icon name="folder-open" />
        <span>No files generated yet</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {files.map((file) => (
        <div
          key={file.fileName}
          className={`${styles.fileItem} ${selectedFile === file.fileName ? styles.fileItemSelected : ''}`}
          onClick={() => onFileSelect(file)}
        >
          <Icon name={getFileIcon(file.fileName)} className={styles.fileIcon} />
          <div className={styles.fileInfo}>
            <div className={styles.fileName}>{file.fileName}</div>
            <div className={styles.fileType}>{file.fileName.split('/')[0]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    padding: ${theme.spacing(0.5)} 0;
  `,
  statusContainer: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(4)};
    color: ${theme.colors.text.secondary};
  `,
  fileItem: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(1)} ${theme.spacing(1.5)};
    cursor: pointer;
    &:hover { background: ${theme.colors.background.secondary}; }
  `,
  fileItemSelected: css`
    background: ${theme.colors.primary.transparent};
    &:hover { background: ${theme.colors.primary.transparent}; }
  `,
  fileIcon: css`
    color: ${theme.colors.text.secondary};
    flex-shrink: 0;
  `,
  fileInfo: css`
    flex: 1;
    min-width: 0;
  `,
  fileName: css`
    font-size: ${theme.typography.bodySmall.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  fileType: css`
    font-size: 11px;
    color: ${theme.colors.text.secondary};
    text-transform: uppercase;
  `,
});
