import React from 'react';
import { css, cx } from '@emotion/css';
import Prism, { Grammar } from 'prismjs';
import 'prismjs/components/prism-sql';

import { GrafanaTheme2 } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';

interface Props {
  query: string;
  lang: {
    grammar: Grammar;
    name: string;
  };
  className?: string;
}

export function RawSQL({ query, lang, className }: Props) {
  const theme = useTheme2();
  const styles = getStyles(theme);
  const highlighted = Prism.highlight(query, lang.grammar, lang.name);

  return (
    <div
      className={cx(styles.editorField, 'prism-syntax-highlight', className)}
      aria-label="Generated SQL query"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    editorField: css({
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
      backgroundColor: theme.colors.background.secondary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      padding: theme.spacing(1),
      overflow: 'auto',
      maxHeight: '200px',
      whiteSpace: 'pre-wrap', // Preserve whitespace and newlines
      wordBreak: 'break-word', // Allow wrapping of long lines
    }),
  };
};
