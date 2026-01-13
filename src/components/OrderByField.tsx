import React, { useMemo } from 'react';
import { Combobox, Text, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { css } from '@emotion/css';
import { OrderPill } from './OrderPill';

interface OrderByFieldProps {
  availableOptions: Array<{ label: string; value: string }>;
  onAdd: (field: string, direction: 'asc' | 'desc') => void;
  onRemove: (field: string) => void;
  onToggleDirection: (field: string) => void;
  order?: Record<string, 'asc' | 'desc'>;
}

export function OrderByField({ availableOptions, onAdd, onRemove, onToggleDirection, order }: OrderByFieldProps) {
  const styles = useStyles2(getStyles);

  // Current order entries
  const orderEntries = useMemo(() => {
    if (!order) {
      return [];
    }
    return Object.entries(order).map(([field, direction]) => ({ field, direction }));
  }, [order]);

  return (
    <div className={styles.orderInputContainer}>
      {orderEntries.map(({ field, direction }) => (
        <OrderPill
          key={field}
          field={field}
          direction={direction}
          onToggleDirection={() => onToggleDirection(field)}
          onRemove={() => onRemove(field)}
        />
      ))}

      {/* Combobox to add new order fields */}
      {availableOptions.length > 0 && (
        <div className={styles.comboboxWrapper}>
          <Combobox
            aria-labelledby="order-by-label"
            options={availableOptions}
            value={null}
            onChange={(option) => {
              if (option?.value) {
                onAdd(option.value, 'asc');
              }
            }}
            placeholder={orderEntries.length === 0 ? 'Add field to order by...' : 'Add field...'}
            width="auto"
            minWidth={15}
          />
        </div>
      )}

      {/* Empty state when no dimensions/measures selected */}
      {availableOptions.length === 0 && orderEntries.length === 0 && (
        <Text italic color="secondary">
          Select dimensions or measures first
        </Text>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  // Container that looks like a MultiSelect input
  orderInputContainer: css({
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    minHeight: 32,
    padding: `${theme.spacing(0.25)} ${theme.spacing(0.5)}`,
    background: theme.components.input.background,
    border: `1px solid ${theme.components.input.borderColor}`,
    borderRadius: theme.shape.radius.default,
    width: 800, // Match MultiSelect width={100}

    '&:focus-within': {
      outline: `2px solid ${theme.colors.primary.main}`,
      outlineOffset: -2,
    },
  }),
  // Wrapper to make Combobox appear inline within our container.
  // Uses !important to override Combobox's default styles (higher specificity).
  comboboxWrapper: css({
    flex: 1,
    minWidth: 100,

    '& > div': {
      border: 'none !important',
      background: 'transparent !important',
      minHeight: 'auto !important',
      padding: '0 !important',
    },

    '& input': {
      background: 'transparent !important',
    },
  }),
});
