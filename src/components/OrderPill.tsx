import React from 'react';
import { useStyles2, Tooltip, IconButton } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';

interface OrderPillProps {
  field: string;
  direction: 'asc' | 'desc';
  onToggleDirection: () => void;
  onRemove: () => void;
}

export const OrderPill = ({ field, direction, onToggleDirection, onRemove }: OrderPillProps) => {
  const displayName = field.split('.').pop() || field;
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.orderPill}>
      {displayName}
      <div className={styles.directionButtons}>
        <Tooltip content={`Click to change to ${direction === 'asc' ? 'descending' : 'ascending'}`}>
          <IconButton
            size="xs"
            name={direction === 'asc' ? 'arrow-up' : 'arrow-down'}
            aria-label={`Sort ${field} ${direction === 'asc' ? 'ascending' : 'descending'}, click to toggle`}
            onClick={onToggleDirection}
          />
        </Tooltip>
        <Tooltip content="Remove">
          <IconButton name="times" size="xs" aria-label={`Remove ${field} from order`} onClick={onRemove} />
        </Tooltip>
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  // Pill styling matching MultiSelect pills
  orderPill: css({
    height: theme.spacing(3),
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    padding: `${theme.spacing(0.25)} ${theme.spacing(0.5)}`,
    background: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  directionButtons: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    marginLeft: theme.spacing(0.5),
  }),
});
