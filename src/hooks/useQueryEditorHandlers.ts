import { ChangeEvent } from 'react';
import { MyQuery, CubeFilter, Operator, Order, DEFAULT_ORDER } from '../types';
import { SelectableValue } from '@grafana/data';

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
    const cleanedOrder = query.order
      ? Object.fromEntries(Object.entries(query.order).filter(([field]) => validFields.has(field)))
      : undefined;

    updateQueryAndRun({
      [type]: newValues,
      order: cleanedOrder && Object.keys(cleanedOrder).length > 0 ? cleanedOrder : undefined,
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
    const newOrder = { ...(query.order || {}), [field]: direction };
    updateQueryAndRun({ order: newOrder });
  };

  const onRemoveOrder = (field: string) => {
    if (!query.order) {
      return;
    }
    const newOrder = { ...query.order };
    delete newOrder[field];
    updateQueryAndRun({ order: Object.keys(newOrder).length > 0 ? newOrder : undefined });
  };

  const onToggleOrderDirection = (field: string) => {
    if (!query.order || !query.order[field]) {
      return;
    }
    const newDirection = query.order[field] === 'asc' ? 'desc' : 'asc';
    updateQueryAndRun({ order: { ...query.order, [field]: newDirection } });
  };

  const onReorderFields = (fromIndex: number, toIndex: number) => {
    if (!query.order) {
      return;
    }
    const orderEntries = Object.entries(query.order);

    // Validate bounds to prevent undefined from being inserted
    if (fromIndex < 0 || fromIndex >= orderEntries.length || toIndex < 0 || toIndex >= orderEntries.length) {
      return;
    }

    const [removed] = orderEntries.splice(fromIndex, 1);
    orderEntries.splice(toIndex, 0, removed);
    const newOrder = Object.fromEntries(orderEntries);
    updateQueryAndRun({ order: newOrder });
  };

  const onAddFilter = (member: string, operator: Operator, values: string[]) => {
    const newFilter: CubeFilter = {
      member,
      operator,
      values,
    };
    const newFilters = [...(query.filters || []), newFilter];
    updateQueryAndRun({ filters: newFilters });
  };

  const onUpdateFilter = (index: number, member: string, operator: Operator, values: string[]) => {
    if (!query.filters || index >= query.filters.length) {
      return;
    }
    const updatedFilter: CubeFilter = {
      member,
      operator,
      values,
    };
    const newFilters = query.filters.map((filter, i) => (i === index ? updatedFilter : filter));
    updateQueryAndRun({ filters: newFilters });
  };

  const onRemoveFilter = (index: number) => {
    if (!query.filters) {
      return;
    }
    const newFilters = query.filters.filter((_, i) => i !== index);
    updateQueryAndRun({ filters: newFilters.length > 0 ? newFilters : undefined });
  };

  return {
    onDimensionOrMeasureChange,
    onLimitChange,
    onAddOrder,
    onRemoveOrder,
    onToggleOrderDirection,
    onReorderFields,
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
  };
}
