import React, { useMemo } from 'react';
import { InlineField, Input, Alert, MultiSelect, Text, Field, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2, QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery } from '../types';
import { SQLPreview } from './SQLPreview';
import { useMetadataQuery, useCompiledSqlQuery, MetadataOption } from 'queries';
import { OrderBy } from './OrderBy/OrderBy';
import { FilterField } from './FilterField/FilterField';
import { useQueryEditorHandlers } from '../hooks/useQueryEditorHandlers';
import { buildCubeQueryJson } from '../utils/buildCubeQuery';

export function QueryEditor({
  query,
  onChange,
  onRunQuery,
  datasource,
}: QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>) {
  const styles = useStyles2(getStyles);
  const cubeQueryJson = useMemo(() => buildCubeQueryJson(query, datasource), [query, datasource]);

  const { data, isLoading: metadataIsLoading, isError: metadataIsError } = useMetadataQuery({ datasource });
  const metadata = data ?? { dimensions: [], measures: [] };

  const { data: compiledSql, isLoading: compiledSqlIsLoading } = useCompiledSqlQuery({
    datasource,
    cubeQueryJson,
  });

  const {
    onDimensionOrMeasureChange,
    onLimitChange,
    onAddOrder,
    onRemoveOrder,
    onToggleOrderDirection,
    onReorderFields,
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
  } = useQueryEditorHandlers(query, onChange, onRunQuery);

  // Map from query order to preserve user selection order (not metadata schema order)
  const selectedDimensions = (query.dimensions || [])
    .map((name) => metadata.dimensions.find((option) => option.value === name))
    .filter((option): option is MetadataOption => option !== undefined);

  const selectedMeasures = (query.measures || [])
    .map((name) => metadata.measures.find((option) => option.value === name))
    .filter((option): option is MetadataOption => option !== undefined);
  const currentLimit = query.limit ?? '';

  // All selected dimensions and measures with their labels (for OrderBy component)
  const availableOrderOptions = useMemo(() => {
    const selectedFields = [...(query.dimensions || []), ...(query.measures || [])];
    return selectedFields.map((field) => ({ label: field.split('.').pop() || field, value: field }));
  }, [query.dimensions, query.measures]);

  return (
    <>
      {metadataIsError && <Alert title="Error fetching metadata" severity="error" />}
      <InlineField label="Dimensions" labelWidth={16} tooltip="Select the dimensions to group your data by" grow>
        <div className={styles.multiSelectWrapper}>
          <div className={styles.multiSelectContainer}>
            <MultiSelect
              aria-label="Dimensions"
              options={metadata.dimensions}
              value={selectedDimensions}
              onChange={(v) => onDimensionOrMeasureChange(v, 'dimensions')}
              placeholder={metadataIsLoading ? 'Loading dimensions...' : 'Select dimensions...'}
              isLoading={metadataIsLoading}
            />
          </div>
        </div>
      </InlineField>

      <InlineField label="Measures" labelWidth={16} tooltip="Select the measures to aggregate" grow>
        <div className={styles.multiSelectWrapper}>
          <div className={styles.multiSelectContainer}>
            <MultiSelect
              aria-label="Measures"
              options={metadata.measures}
              value={selectedMeasures}
              onChange={(v) => onDimensionOrMeasureChange(v, 'measures')}
              placeholder={metadataIsLoading ? 'Loading measures...' : 'Select measures...'}
              isLoading={metadataIsLoading}
            />
          </div>
        </div>
      </InlineField>

      <InlineField label="Row Limit" labelWidth={16} tooltip="Maximum number of rows to return (optional)">
        <Input
          aria-label="Row Limit"
          type="number"
          value={currentLimit}
          onChange={onLimitChange}
          placeholder="Enter row limit..."
          width={30}
          min={1}
        />
      </InlineField>

      <Field label="Filters" description="Filter results by field values">
        <FilterField
          filters={query.filters}
          dimensions={metadata.dimensions}
          onAdd={onAddFilter}
          onUpdate={onUpdateFilter}
          onRemove={onRemoveFilter}
          datasource={datasource}
        />
      </Field>

      <Field label="Order By" description="Order results by selected fields">
        <OrderBy
          order={query.order}
          availableOptions={availableOrderOptions}
          onAdd={onAddOrder}
          onRemove={onRemoveOrder}
          onToggleDirection={onToggleOrderDirection}
          onReorder={onReorderFields}
        />
      </Field>

      {!compiledSql && compiledSqlIsLoading && (
        <InlineField label="" labelWidth={16}>
          <Text>Compiling SQL...</Text>
        </InlineField>
      )}

      <SQLPreview
        sql={compiledSql?.sql ?? ''}
        exploreSqlDatasourceUid={datasource.instanceSettings?.jsonData?.exploreSqlDatasourceUid}
      />
    </>
  );
}

const getStyles = (_theme: GrafanaTheme2) => {
  return {
    multiSelectWrapper: css({
      width: '100%',
      containerType: 'inline-size',
    }),
    multiSelectContainer: css({
      width: '100%',
      minWidth: '240px',
    }),
  };
};
