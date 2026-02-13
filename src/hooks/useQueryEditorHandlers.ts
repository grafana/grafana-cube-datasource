import type { TQueryOrderArray } from '@cubejs-client/core';
import { ChangeEvent } from 'react';
import { CubeQuery, CubeFilter, Order, DEFAULT_ORDER } from '../types';
import { SelectableValue } from '@grafana/data';
import { normalizeOrder } from '../utils/normalizeOrder';

export function useQueryEditorHandlers(query: CubeQuery, onChange: (query: CubeQuery) => void, onRunQuery: () => void) {
  const updateQueryAndRun = (updates: Partial<CubeQuery>) => {
    onChange({ ...query, ...updates });
    onRunQuery();
  };

  const onDimensionOrMeasureChange = (values: Array<SelectableValue<string>>, type: 'views' | 'measures' | 'dimensions') => {
    const newValues = values.map((v) => v.value).filter((v): v is string => Boolean(v));

    if (type === 'views') {
      updateQueryAndRun({ views: newValues });
      return;
    }

    // Include newValues for the type being updated, and existing values for the other type
    const otherType = type === 'measures' ? 'dimensions' : 'measures';
    const validFields = new Set([...newValues, ...(query[otherType] || [])]);

    // Clean up order: remove any ordered fields that are no longer selected
    const normalizedOrder = normalizeOrder(query.order);
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
    const normalizedOrder = normalizeOrder(query.order);
    const newOrder: TQueryOrderArray = [...(normalizedOrder || []), [field, direction]];
    updateQueryAndRun({ order: newOrder });
  };

  const onRemoveOrder = (field: string) => {
    const normalizedOrder = normalizeOrder(query.order);
    if (!normalizedOrder) {
      return;
    }
    const newOrder = normalizedOrder.filter(([f]) => f !== field);
    updateQueryAndRun({ order: newOrder.length > 0 ? newOrder : undefined });
  };

  const onToggleOrderDirection = (field: string) => {
    const normalizedOrder = normalizeOrder(query.order);
    if (!normalizedOrder) {
      return;
    }
    const index = normalizedOrder.findIndex(([f]) => f === field);
    if (index === -1) {
      return;
    }
    // Toggle between 'asc' and 'desc' - if current direction is 'none' or 'asc', switch to 'desc'
    const currentDirection = normalizedOrder[index][1];
    const newDirection: Order = currentDirection === 'asc' ? 'desc' : 'asc';
    const newOrder: TQueryOrderArray = [...normalizedOrder];
    newOrder[index] = [field, newDirection];
    updateQueryAndRun({ order: newOrder });
  };

  const onReorderFields = (fromIndex: number, toIndex: number) => {
    const normalizedOrder = normalizeOrder(query.order);
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
