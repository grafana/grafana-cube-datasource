import React, { useMemo } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { ModelFile } from 'types';

interface FileListProps {
  files: ModelFile[];
  selectedFile?: string;
  onFileSelect: (fileName: string, content: string) => void;
}

function sortFiles(files: ModelFile[]): ModelFile[] {
  return [...files].sort((a, b) => {
    const typeOrder = { cubes: 0, views: 1 } as Record<string, number>;
    const aType = a.fileName.split('/')[0];
    const bType = b.fileName.split('/')[0];
    const aOrder = typeOrder[aType] ?? 2;
    const bOrder = typeOrder[bType] ?? 2;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

export function FileList({ files, selectedFile, onFileSelect }: FileListProps) {
  const styles = useStyles2(getStyles);
  const sortedFiles = useMemo(() => sortFiles(files), [files]);

  if (sortedFiles.length === 0) {
    return <div className={styles.empty}>No files generated yet</div>;
  }

  return (
    <div className={styles.container}>
      {sortedFiles.map((file) => (
        <button
          type="button"
          key={file.fileName}
          onClick={() => onFileSelect(file.fileName, file.content)}
          className={`${styles.fileButton} ${selectedFile === file.fileName ? styles.selected : ''}`}
          aria-label={file.fileName}
        >
          {file.fileName}
        </button>
      ))}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  fileButton: css`
    border: 1px solid ${theme.colors.border.weak};
    background: ${theme.colors.background.primary};
    color: ${theme.colors.text.primary};
    border-radius: ${theme.shape.radius.default};
    text-align: left;
    cursor: pointer;
    padding: ${theme.spacing(1)};
    &:hover {
      background: ${theme.colors.background.secondary};
    }
  `,
  selected: css`
    border-color: ${theme.colors.primary.main};
  `,
  empty: css`
    color: ${theme.colors.text.secondary};
  `,
});
