import React from 'react';
import { Select, useStyles2 } from '@grafana/ui';
import { Operator } from '../../types';
import { AccessoryButton, InputGroup } from '@grafana/plugin-ui';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { DataSource } from '../../datasource';
import { useMemberValuesQuery } from '../../queries';
import { css } from '@emotion/css';
import { components, MultiValueRemoveProps } from 'react-select';

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
  const styles = useStyles2(getStyles);
  const { data: tagValues = [], isLoading } = useMemberValuesQuery({
    datasource,
    member: filter.member,
  });

  // Get values already selected for this member by other filters
  const usedValues = new Set(
    allFilters
      .filter((f, i) => i !== index && f.member === filter.member)
      .flatMap((f) => f.values)
      .filter((value): value is string => Boolean(value))
  );

  const selectedValues = filter.values ?? [];
  const selectedValuesSet = new Set(selectedValues);
  const selectedOptions = selectedValues.map((value) => ({ label: value, value }));

  const valueOptions = [
    ...selectedOptions,
    ...tagValues
      .filter((tagValue) => !usedValues.has(tagValue.text) && !selectedValuesSet.has(tagValue.text))
      .map((tagValue) => ({
        label: tagValue.text,
        value: tagValue.text,
      })),
  ];

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
      <Select
        aria-label="Select value"
        options={valueOptions}
        value={selectedOptions}
        onChange={(options: Array<SelectableValue<string>> | SelectableValue<string> | null) => {
          const selected = Array.isArray(options) ? options : options ? [options] : [];
          const values = Array.from(
            new Set(selected.map((option) => option.value).filter((value): value is string => Boolean(value)))
          );
          onUpdate(index, { values });
        }}
        placeholder={isLoading ? 'Loading...' : 'Select values'}
        className={styles.valueSelect}
        disabled={!filter.member}
        isLoading={isLoading}
        isMulti
        closeMenuOnSelect={false}
        components={{ MultiValueRemove }}
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

const MultiValueRemove = (props: MultiValueRemoveProps<SelectableValue<string>>) => {
  const label = props.data?.label ?? props.data?.value ?? 'value';

  return (
    <components.MultiValueRemove
      {...props}
      innerProps={{
        ...props.innerProps,
        'aria-label': `Remove ${label}`,
      }}
    />
  );
};

const getStyles = (_theme: GrafanaTheme2) => {
  return {
    valueSelect: css({
      minWidth: '280px',
      maxWidth: '520px',
      flex: '1 1 360px',
    }),
  };
};
