import React from 'react';
import { MultiSelect, Select } from '@grafana/ui';
import { Operator } from '../../types';
import { AccessoryButton, InputGroup } from '@grafana/plugin-ui';
import { SelectableValue } from '@grafana/data';
import { DataSource } from '../../datasource';
import { useMemberValuesQuery } from '../../queries';

const OPERATOR_OPTIONS: Array<{ label: string; value: Operator }> = [
  { label: '=', value: Operator.Equals },
  { label: '!=', value: Operator.NotEquals },
];

export type FilterState = {
  member: string | null;
  operator: Operator;
  values: string[];
};

interface FilterRowProps {
  filter: FilterState;
  index: number;
  dimensions: Array<SelectableValue<string>>;
  allFilters: FilterState[];
  onUpdate: (index: number, updates: Partial<FilterState>) => void;
  onRemove: (index: number) => void;
  datasource: DataSource;
}

export function FilterRow({ filter, index, dimensions, allFilters, onUpdate, onRemove, datasource }: FilterRowProps) {
  const { data: tagValues = [], isLoading } = useMemberValuesQuery({
    datasource,
    member: filter.member,
  });

  // Get values already selected for this member by other filters (flattening all their values arrays)
  const usedValues = new Set(
    allFilters.filter((f, i) => i !== index && f.member === filter.member).flatMap((f) => f.values)
  );

  const valueOptions = tagValues
    .filter((tagValue) => !usedValues.has(tagValue.text))
    .map((tagValue) => ({
      label: tagValue.text,
      value: tagValue.text,
    }));

  // Map current filter values to SelectableValue format for MultiSelect
  const selectedValues = filter.values.map((v) => ({ label: v, value: v }));

  return (
    <InputGroup>
      <Select
        aria-label="Select field"
        options={dimensions}
        value={filter.member}
        onChange={(option) => onUpdate(index, { member: option?.value || null, values: [] })}
        placeholder="Select field"
        width="auto"
      />
      <Select
        aria-label="Select operator"
        options={OPERATOR_OPTIONS}
        value={filter.operator}
        onChange={(option) => onUpdate(index, { operator: option.value as Operator })}
        width="auto"
      />
      <MultiSelect
        aria-label="Select values"
        options={valueOptions}
        value={selectedValues}
        onChange={(selected) => onUpdate(index, { values: selected.map((s) => s.value || '') })}
        placeholder={isLoading ? 'Loading...' : 'Select values'}
        width={50}
        disabled={!filter.member}
        isLoading={isLoading}
        isClearable
        closeMenuOnSelect={false}
      />
      <AccessoryButton
        size="md"
        onClick={() => onRemove(index)}
        aria-label="Remove filter"
        icon="times"
        variant="secondary"
      />
    </InputGroup>
  );
}
