import React, { useMemo } from 'react';
import { InlineField, Input, Alert, MultiSelect, Text, Field, Tooltip, Icon, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2, QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { CubeDataSourceOptions, CubeQuery, CubeFilter, isCubeFilter, VISUAL_BUILDER_OPERATORS } from '../types';
import { SQLPreview } from './SQLPreview';
import { useMetadataQuery, useCompiledSqlQuery, MetadataOption } from 'queries';
import { OrderBy } from './OrderBy/OrderBy';
import { FilterField } from './FilterField/FilterField';
import { useQueryEditorHandlers } from '../hooks/useQueryEditorHandlers';
import { buildCubeQueryJson } from '../utils/buildCubeQuery';
import { detectUnsupportedFeatures, getUnsupportedQueryKeys } from '../utils/detectUnsupportedFeatures';
import { UnsupportedFieldsViewer } from './UnsupportedFieldsViewer';

type Props = QueryEditorProps<DataSource, CubeQuery, CubeDataSourceOptions>;

/**
 * Top-level query editor. Always renders the visual editor, and when
 * unsupported features are detected, additionally shows a compact
 * read-only JSON callout for just the unsupported fields.
 */
export function QueryEditor(props: Props) {
  const { query, datasource } = props;
  const unsupportedFeatures = useMemo(() => detectUnsupportedFeatures(query), [query]);
  const unsupportedKeys = useMemo(() => getUnsupportedQueryKeys(query), [query]);

  const cubeQueryJson = useMemo(() => buildCubeQueryJson(query, datasource), [query, datasource]);
  const { data: compiledSql, isLoading: compiledSqlIsLoading } = useCompiledSqlQuery({
    datasource,
    cubeQueryJson,
  });

  return (
    <>
      <VisualQueryEditor {...props} />

      {unsupportedFeatures.length > 0 && (
        <UnsupportedFieldsViewer
          query={query}
          unsupportedKeys={unsupportedKeys}
          reasons={unsupportedFeatures}
        />
      )}

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

/**
 * The full visual query builder with dimensions, measures, filters,
 * ordering, and SQL preview.
 */
function VisualQueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const styles = useStyles2(getStyles);

  const { data, isLoading: metadataIsLoading, isError: metadataIsError } = useMetadataQuery({ datasource });
  const metadata = data ?? { dimensions: [], measures: [] };

  const {
    onDimensionOrMeasureChange,
    onLimitChange,
    onAddOrder,
    onRemoveOrder,
    onToggleOrderDirection,
    onReorderFields,
    onFiltersChange,
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

      <Field
        label={
          <span className={styles.fieldLabelWithTooltip}>
            Filters
            <Tooltip
              content="The visual builder supports equals/notEquals filters on dimensions. For comparison operators, measure filters, and AND/OR groups, use the panel JSON editor."
              placement="top"
            >
              <span className={styles.tooltipIcon}>
                <Icon name="info-circle" size="sm" />
              </span>
            </Tooltip>
          </span>
        }
        description="Filter results by field values"
      >
        <FilterField
          filters={query.filters?.filter(
            (f): f is CubeFilter => isCubeFilter(f) && VISUAL_BUILDER_OPERATORS.has(f.operator)
          )}
          dimensions={metadata.dimensions}
          onChange={onFiltersChange}
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
    </>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    multiSelectWrapper: css({
      width: '100%',
      containerType: 'inline-size',
    }),
    multiSelectContainer: css({
      width: '100%',
      minWidth: '240px',
    }),
    fieldLabelWithTooltip: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: theme.spacing(0.5),
    }),
    tooltipIcon: css({
      display: 'inline-flex',
      color: theme.colors.text.secondary,
    }),
  };
};
