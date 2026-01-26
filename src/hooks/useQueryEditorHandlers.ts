import { ChangeEvent } from 'react';
import { MyQuery, CubeFilter, Order, DEFAULT_ORDER } from '../types';
import { SelectableValue } from '@grafana/data';
import { normalizeOrder, OrderArray } from '../utils/normalizeOrder';

export function useQueryEditorHandlers(query: MyQuery, onChange: (query: MyQuery) => void, onRunQuery: () => void) {
  const updateQueryAndRun = (updates: Partial<MyQuery>) => {
    onChange({ ...query, ...updates });
    onRunQuery();
  };

  const onDimensionOrMeasureChange = (values: Array<SelectableValue<string>>, type: 'measures' | 'dimensions') => {
    const newValues = values.map((v) => v.value).filter((v): v is string => Boolean(v));

    // Include newValues for the type being updated, and existing values for the other type
    const otherType = type === 'measures' ? 'dimensions' : 'measures';
    const validFields = new Set([...newValues, ...(query[otherType] || [])]);

    // Clean up order: remove any ordered fields that are no longer selected
    const normalized = normalizeOrder(query.order);
    const normalizedOrder: OrderArray | undefined = normalized && Array.isArray(normalized) ? (normalized as unknown as OrderArray) : undefined;
    const cleanedOrder = normalizedOrder ? normalizedOrder.filter(([field]) => validFields.has(field)) : undefined;

    updateQueryAndRun({
      [type]: newValues,
      order: cleanedOrder && cleanedOrder.length > 0 ? cleanedOrder : undefined,
    });
  };

  const onLimitChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const limit = value === '' ? undefined : parseInt(value, 10);

    // Only update if the value is empty or a valid positive integer
    if (value === '' || (!isNaN(limit!) && limit! > 0)) {
      updateQueryAndRun({ limit });
    }
  };

  const onAddOrder = (field: string, direction: Order = DEFAULT_ORDER) => {
    const normalized = normalizeOrder(query.order);
    const normalizedOrder: OrderArray | undefined = normalized && Array.isArray(normalized) ? (normalized as unknown as OrderArray) : undefined;
    const newOrder: OrderArray = [...(normalizedOrder || []), [field, direction]];
    updateQueryAndRun({ order: newOrder });
  };

  const onRemoveOrder = (field: string) => {
    const normalized = normalizeOrder(query.order);
    const normalizedOrder: OrderArray | undefined = normalized && Array.isArray(normalized) ? (normalized as unknown as OrderArray) : undefined;
    if (!normalizedOrder) {
      return;
    }
    const newOrder = normalizedOrder.filter(([f]) => f !== field);
    updateQueryAndRun({ order: newOrder.length > 0 ? newOrder : undefined });
  };

  const onToggleOrderDirection = (field: string) => {
    const normalized = normalizeOrder(query.order);
    const normalizedOrder: OrderArray | undefined = normalized && Array.isArray(normalized) ? (normalized as unknown as OrderArray) : undefined;
    if (!normalizedOrder) {
      return;
    }
    const index = normalizedOrder.findIndex(([f]) => f === field);
    if (index === -1) {
      return;
    }
    const newDirection = normalizedOrder[index][1] === 'asc' ? 'desc' : 'asc';
    const newOrder: OrderArray = [...normalizedOrder];
    newOrder[index] = [field, newDirection];
    updateQueryAndRun({ order: newOrder });
  };

  const onReorderFields = (fromIndex: number, toIndex: number) => {
    const normalized = normalizeOrder(query.order);
    const normalizedOrder: OrderArray | undefined = normalized && Array.isArray(normalized) ? (normalized as unknown as OrderArray) : undefined;
    if (!normalizedOrder) {
      return;
    }

    // Validate bounds to prevent undefined from being inserted
    if (fromIndex < 0 || fromIndex >= normalizedOrder.length || toIndex < 0 || toIndex >= normalizedOrder.length) {
      return;
    }

    const newOrder = [...normalizedOrder];
    const [removed] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, removed);
    updateQueryAndRun({ order: newOrder });
  };

  const onFiltersChange = (filters: CubeFilter[]) => {
    updateQueryAndRun({ filters: filters.length > 0 ? filters : undefined });
  };

  return {
    onDimensionOrMeasureChange,
    onLimitChange,
    onAddOrder,
    onRemoveOrder,
    onToggleOrderDirection,
    onReorderFields,
    onFiltersChange,
  };
}
