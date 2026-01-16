import React, { useState } from 'react';
import { Stack, Button } from '@grafana/ui';
import { CubeFilter, Operator } from '../../types';
import { SelectableValue } from '@grafana/data';
import { DataSource } from '../../datasource';
import { FilterRow, FilterState } from './FilterRow';

interface FilterFieldProps {
  dimensions: Array<SelectableValue<string>>;
  filters?: CubeFilter[];
  onAdd: (member: string, operator: Operator, value: string) => void;
  onUpdate: (index: number, member: string, operator: Operator, value: string) => void;
  onRemove: (index: number) => void;
  datasource: DataSource;
}

export function FilterField({ dimensions, filters = [], onAdd, onUpdate, onRemove, datasource }: FilterFieldProps) {
  const [filterStates, setFilterStates] = useState<FilterState[]>(() =>
    filters.map((filter) => ({
      member: filter.member,
      operator: filter.operator,
      value: filter.values[0] || '',
    }))
  );

  const hasIncompleteFilter = filterStates.some((f) => !f.member || !f.value);

  const handleAddNew = () => {
    setFilterStates([
      ...filterStates,
      {
        member: null,
        operator: Operator.Equals,
        value: '',
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

    if (updatedFilter.member && updatedFilter.value) {
      // If this is an existing filter, update it otherwise add it
      if (index < filters.length) {
        onUpdate(index, updatedFilter.member, updatedFilter.operator, updatedFilter.value);
      } else {
        onAdd(updatedFilter.member, updatedFilter.operator, updatedFilter.value);
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
