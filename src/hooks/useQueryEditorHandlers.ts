import { ChangeEvent } from 'react';
import type { MyQuery, CubeFilter, Operator } from '../types';
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

  const onAddOrder = (field: string, direction: 'asc' | 'desc' = 'asc') => {
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

  const onAddFilter = (member: string, operator: Operator, value: string) => {
    const newFilter: CubeFilter = {
      member,
      operator,
      values: [value],
    };
    const newFilters = [...(query.filters || []), newFilter];
    updateQueryAndRun({ filters: newFilters });
  };

  const onUpdateFilter = (index: number, member: string, operator: Operator, value: string) => {
    if (!query.filters || index >= query.filters.length) {
      return;
    }
    const updatedFilter: CubeFilter = {
      member,
      operator,
      values: [value],
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
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
  };
}
