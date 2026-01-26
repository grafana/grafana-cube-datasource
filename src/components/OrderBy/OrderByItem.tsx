import React from 'react';
import { IconButton, useStyles2, Text } from '@grafana/ui';
import { QueryOrder } from 'types';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Draggable } from '@hello-pangea/dnd';

interface OrderByItemProps {
  field: string;
  direction: QueryOrder;
  index: number;
  label: string;
  onRemove: (field: string) => void;
  onToggleDirection: (field: string) => void;
}

export function OrderByItem({ field, direction, index, label, onRemove, onToggleDirection }: OrderByItemProps) {
  const styles = useStyles2(getStyles);

  return (
    <Draggable key={field} draggableId={field} index={index}>
      {(provided, snapshot) => (
        <div
          className={styles.container}
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{
            ...provided.draggableProps.style,
            ...(snapshot.isDragging && { backgroundColor: 'rgba(0, 0, 0, 0.1)' }),
          }}
        >
          <div className={styles.containerContent}>
            <IconButton
              aria-label="Drag handle"
              name="draggabledots"
              variant="secondary"
              {...provided.dragHandleProps}
            />
            <Text variant="bodySmall">{label}</Text>
          </div>
          <div className={styles.containerContent}>
            <IconButton
              name={direction === 'asc' ? 'sort-amount-up' : 'sort-amount-down'}
              variant="secondary"
              onClick={() => onToggleDirection(field)}
              tooltip="Change the sort direction"
            />
            <IconButton
              name="times"
              variant="secondary"
              onClick={() => onRemove(field)}
              tooltip="Remove field from order by"
            />
          </div>
        </div>
      )}
    </Draggable>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    container: css({
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing(0.5),
      padding: theme.spacing(1),
      borderBottom: `1px solid ${theme.colors.border.weak}`,
    }),
    containerContent: css({
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing(0.5),
    }),
  };
};
