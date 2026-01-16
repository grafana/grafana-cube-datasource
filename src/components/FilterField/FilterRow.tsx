import React from 'react';
import { Select } from '@grafana/ui';
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
  value: string | null;
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

  // Get values already selected for this member by other filters
  const usedValues = new Set(
    allFilters.filter((f, i) => i !== index && f.member === filter.member && f.value).map((f) => f.value)
  );

  const valueOptions = tagValues
    .filter((tagValue) => !usedValues.has(tagValue.text))
    .map((tagValue) => ({
      label: tagValue.text,
      value: tagValue.text,
    }));

  return (
    <InputGroup>
      <Select
        aria-label="Select field"
        options={dimensions}
        value={filter.member}
        onChange={(option) => onUpdate(index, { member: option?.value || null, value: null })}
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
      <Select
        aria-label="Select value"
        options={valueOptions}
        value={filter.value}
        onChange={(option) => onUpdate(index, { value: option.value || '' })}
        placeholder={isLoading ? 'Loading...' : 'Select value'}
        width="auto"
        disabled={!filter.member}
        isLoading={isLoading}
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
