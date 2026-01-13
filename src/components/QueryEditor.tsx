import React, { useMemo } from 'react';
import { InlineField, Input, Alert, MultiSelect, Text } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery } from '../types';
import { SQLPreview } from './SQLPreview';
import { useMetadataQuery, useCompiledSqlQuery, MetadataOption } from 'queries';
import { OrderByField } from './OrderByField';
import { useQueryEditorHandlers } from '../hooks/useQueryEditorHandlers';
import { buildCubeQueryJson } from '../utils/buildCubeQuery';

export function QueryEditor({
  query,
  onChange,
  onRunQuery,
  datasource,
}: QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>) {
  const cubeQueryJson = useMemo(() => buildCubeQueryJson(query, datasource), [query, datasource]);

  const { data, isLoading: metadataIsLoading, isError: metadataIsError } = useMetadataQuery({ datasource });
  const { dimensions, measures } = data ?? { dimensions: [], measures: [] };

  const { data: compiledSql, isLoading: compiledSqlIsLoading } = useCompiledSqlQuery({
    datasource,
    cubeQueryJson,
  });

  const { onDimensionOrMeasureChange, onLimitChange, onAddOrder, onRemoveOrder, onToggleOrderDirection } =
    useQueryEditorHandlers(query, onChange, onRunQuery);

  const selectedDimensions = dimensions.filter(({ value }: MetadataOption) => query.dimensions?.includes(value));
  const selectedMeasures = measures.filter(({ value }: MetadataOption) => query.measures?.includes(value));
  const currentLimit = query.limit ?? '';

  // Fields available for ordering (only selected dimensions and measures that aren't already ordered)
  const availableOrderOptions = useMemo(() => {
    const selectedFields = [...(query.dimensions || []), ...(query.measures || [])];
    const alreadyOrdered = Object.keys(query.order || {});
    return selectedFields
      .filter((field) => !alreadyOrdered.includes(field))
      .map((field) => ({ label: field.split('.').pop() || field, value: field }));
  }, [query.dimensions, query.measures, query.order]);

  return (
    <>
      {metadataIsError && <Alert title="Error fetching metadata" severity="error" />}
      <InlineField label="Dimensions" labelWidth={16} tooltip="Select the dimensions to group your data by">
        <MultiSelect
          aria-label="Dimensions"
          options={dimensions}
          value={selectedDimensions}
          onChange={(v) => onDimensionOrMeasureChange(v, 'dimensions')}
          placeholder={metadataIsLoading ? 'Loading dimensions...' : 'Select dimensions...'}
          width={100}
          isLoading={metadataIsLoading}
        />
      </InlineField>

      <InlineField label="Measures" labelWidth={16} tooltip="Select the measures to aggregate">
        <MultiSelect
          aria-label="Measures"
          options={measures}
          value={selectedMeasures}
          onChange={(v) => onDimensionOrMeasureChange(v, 'measures')}
          placeholder={metadataIsLoading ? 'Loading measures...' : 'Select measures...'}
          width={100}
          isLoading={metadataIsLoading}
        />
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

      <InlineField label="Order By" labelWidth={16} tooltip="Order results by selected fields">
        <OrderByField
          order={query.order}
          availableOptions={availableOrderOptions}
          onAdd={onAddOrder}
          onRemove={onRemoveOrder}
          onToggleDirection={onToggleOrderDirection}
        />
      </InlineField>

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
