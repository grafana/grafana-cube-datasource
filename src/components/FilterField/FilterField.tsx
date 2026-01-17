import React, { useState } from 'react';
import { Stack, Button } from '@grafana/ui';
import { CubeFilter, Operator } from '../../types';
import { SelectableValue } from '@grafana/data';
import { DataSource } from '../../datasource';
import { FilterRow, FilterState } from './FilterRow';

interface FilterFieldProps {
  dimensions: Array<SelectableValue<string>>;
  filters?: CubeFilter[];
  onAdd: (member: string, operator: Operator, values: string[]) => void;
  onUpdate: (index: number, member: string, operator: Operator, values: string[]) => void;
  onRemove: (index: number) => void;
  datasource: DataSource;
}

export function FilterField({ dimensions, filters = [], onAdd, onUpdate, onRemove, datasource }: FilterFieldProps) {
  const [filterStates, setFilterStates] = useState<FilterState[]>(() =>
    filters.map((filter) => ({
      member: filter.member,
      operator: filter.operator,
      values: filter.values,
    }))
  );

  const hasIncompleteFilter = filterStates.some((f) => !f.member || f.values.length === 0);

  const handleAddNew = () => {
    setFilterStates([
      ...filterStates,
      {
        member: null,
        operator: Operator.Equals,
        values: [],
      },
    ]);
  };

  const handleRemove = (index: number) => {
    // Only call onRemove if this filter exists in the parent's filters array
    if (index < filters.length) {
      onRemove(index);
    }
    setFilterStates(filterStates.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, updates: Partial<FilterState>) => {
    const updatedFilter = { ...filterStates[index], ...updates };
    setFilterStates(filterStates.map((f, i) => (i === index ? updatedFilter : f)));

    if (updatedFilter.member && updatedFilter.values.length > 0) {
      // If this is an existing filter, update it otherwise add it
      if (index < filters.length) {
        onUpdate(index, updatedFilter.member, updatedFilter.operator, updatedFilter.values);
      } else {
        onAdd(updatedFilter.member, updatedFilter.operator, updatedFilter.values);
      }
    }
  };

  return (
    <Stack direction="column" gap={0.5}>
      {filterStates.map((filter, index) => (
        <FilterRow
          key={index}
          filter={filter}
          index={index}
          dimensions={dimensions}
          allFilters={filterStates}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          datasource={datasource}
        />
      ))}
      <div>
        <Button
          onClick={handleAddNew}
          disabled={hasIncompleteFilter}
          icon="plus"
          variant="secondary"
          size="sm"
          aria-label="Add filter"
        >
          Add Filter
        </Button>
      </div>
    </Stack>
  );
}
