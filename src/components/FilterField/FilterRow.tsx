import React from 'react';
import { MultiSelect, Select, useStyles2 } from '@grafana/ui';
import { Operator } from '../../types';
import { AccessoryButton, InputGroup } from '@grafana/plugin-ui';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { DataSource } from '../../datasource';
import { useMemberValuesQuery } from '../../queries';
import { css } from '@emotion/css';

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
  onUpdate: (index: number, updates: Partial<FilterState>) => void;
  onRemove: (index: number) => void;
  datasource: DataSource;
}

export function FilterRow({ filter, index, dimensions, onUpdate, onRemove, datasource }: FilterRowProps) {
  const styles = useStyles2(getStyles);
  const { data: tagValues = [], isLoading } = useMemberValuesQuery({
    datasource,
    member: filter.member,
  });

  const valueOptions = tagValues.map((tagValue) => ({
    label: tagValue.text,
    value: tagValue.text,
  }));

  // Convert filter.values to SelectableValue array for MultiSelect
  const selectedValues: Array<SelectableValue<string>> = filter.values.map((v) => ({
    label: v,
    value: v,
  }));

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
      <div className={styles.valueSelectWrapper}>
        <div className={styles.valueSelect}>
          <MultiSelect
            aria-label="Select values"
            options={valueOptions}
            value={selectedValues}
            onChange={(options) =>
              onUpdate(index, { values: options.map((o) => o.value).filter((v): v is string => !!v) })
            }
            placeholder={isLoading ? 'Loading...' : 'Select values'}
            disabled={!filter.member}
            isLoading={isLoading}
            closeMenuOnSelect={false}
          />
        </div>
      </div>
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

const getStyles = (_theme: GrafanaTheme2) => ({
  valueSelectWrapper: css({
    flex: '1 1 auto',
    containerType: 'inline-size',
  }),
  valueSelect: css({
    width: '100%',
    minWidth: '150px',
  }),
});
