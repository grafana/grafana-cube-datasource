import React, { useMemo, useState } from 'react';
import { Select, useStyles2 } from '@grafana/ui';
import { DEFAULT_ORDER, Order } from 'types';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { OrderByItem } from './OrderByItem';
import { normalizeOrder, OrderInput } from '../../utils/normalizeOrder';

interface OrderByProps {
  availableOptions: Array<{ label: string; value: string }>;
  onAdd: (field: string, direction: Order) => void;
  onRemove: (field: string) => void;
  onToggleDirection: (field: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  order?: OrderInput;
}

/**
 * Represents an order entry with field and direction for display in the UI.
 */
interface OrderEntry {
  field: string;
  direction: 'asc' | 'desc' | 'none';
}

export function OrderBy({ availableOptions, onAdd, onRemove, onToggleDirection, onReorder, order }: OrderByProps) {
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const styles = useStyles2(getStyles);
  const orderEntries = useMemo((): OrderEntry[] => {
    const normalized = normalizeOrder(order);
    if (!normalized) {
      return [];
    }
    return normalized.map(([field, direction]) => ({ field, direction }));
  }, [order]);

  const availableFieldsToAdd = useMemo(() => {
    const selectedFields = new Set(orderEntries.map((entry) => entry.field));
    return availableOptions.filter((option) => !selectedFields.has(option.value));
  }, [availableOptions, orderEntries]);

  const getFieldLabel = (fieldValue: string) => {
    return availableOptions.find((option) => option.value === fieldValue)?.label || fieldValue;
  };

  const handleAddField = (fieldValue: string | undefined) => {
    if (fieldValue) {
      onAdd(fieldValue, DEFAULT_ORDER);
      setSelectedField(null);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }
    if (result.source.index === result.destination.index) {
      return;
    }
    onReorder(result.source.index, result.destination.index);
  };

  return (
    <div className={styles.container}>
      {orderEntries.length > 0 && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="order-by-fields">
            {(provided) => (
              <div className={styles.items} ref={provided.innerRef} {...provided.droppableProps}>
                {orderEntries.map(({ field, direction }, index) => (
                  <OrderByItem
                    key={field}
                    field={field}
                    direction={direction}
                    index={index}
                    label={getFieldLabel(field)}
                    onRemove={onRemove}
                    onToggleDirection={onToggleDirection}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
      <Select
        className={styles.select}
        placeholder="Add fields..."
        aria-label="Order By"
        options={availableFieldsToAdd}
        value={selectedField}
        onChange={(option) => handleAddField(option?.value)}
      />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    container: css({
      width: '400px',
      display: 'flex',
      flexDirection: 'column',
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      backgroundColor: theme.colors.background.canvas,
    }),
    select: css({
      background: 'none',
      border: 'none',
    }),
    items: css({
      display: 'flex',
      flexDirection: 'column',
    }),
  };
};
