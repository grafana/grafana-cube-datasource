import React, { useState } from 'react';
import { Stack, Button } from '@grafana/ui';
import { CubeFilter, Operator } from '../../types';
import { SelectableValue } from '@grafana/data';
import { DataSource } from '../../datasource';
import { FilterRow, FilterState } from './FilterRow';

interface FilterFieldProps {
  dimensions: Array<SelectableValue<string>>;
  filters?: CubeFilter[];
  onChange: (filters: CubeFilter[]) => void;
  datasource: DataSource;
}

export function FilterField({ dimensions, filters = [], onChange, datasource }: FilterFieldProps) {
  const [filterStates, setFilterStates] = useState<FilterState[]>(() =>
    filters.map((filter) => ({
      member: filter.member,
      operator: filter.operator,
      values: filter.values ?? [],
    }))
  );

  // Derive complete filters and sync to parent
  const syncToParent = (newStates: FilterState[]) => {
    const completeFilters: CubeFilter[] = newStates
      .filter((f): f is FilterState & { member: string } => f.member !== null)
      .map((f) => ({
        member: f.member,
        operator: f.operator,
        values: f.values,
      }));
    onChange(completeFilters);
  };

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
    const newStates = filterStates.filter((_, i) => i !== index);
    setFilterStates(newStates);
    syncToParent(newStates);
  };

  const handleUpdate = (index: number, updates: Partial<FilterState>) => {
    const newStates = filterStates.map((f, i) => (i === index ? { ...f, ...updates } : f));
    setFilterStates(newStates);
    syncToParent(newStates);
  };

  return (
    <Stack direction="column" gap={0.5}>
      {filterStates.map((filter, index) => {
        // Scope this row's value dropdown by the complete filters that precede it
        // (issue #32), mirroring how AdHoc filters progressively narrow options.
        // Incomplete rows (no member or no selected values) are excluded.
        const precedingFilters: CubeFilter[] = filterStates
          .slice(0, index)
          .filter((f): f is FilterState & { member: string } => f.member !== null && f.values.length > 0)
          .map((f) => ({ member: f.member, operator: f.operator, values: f.values }));

        return (
          <FilterRow
            key={index}
            filter={filter}
            index={index}
            dimensions={dimensions}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            datasource={datasource}
            precedingFilters={precedingFilters}
          />
        );
      })}
      <div>
        <Button onClick={handleAddNew} icon="plus" variant="secondary" size="sm" aria-label="Add filter">
          Add Filter
        </Button>
      </div>
    </Stack>
  );
}
