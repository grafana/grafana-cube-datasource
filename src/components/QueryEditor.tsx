import React, { useMemo } from 'react';
import { InlineField, Input, Alert, MultiSelect, Text, Field, TextLink, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2, QueryEditorProps } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { DataSource } from '../datasource';
import { CubeDataSourceOptions, CubeQuery, CubeFilter, isCubeFilter } from '../types';
import { SQLPreview } from './SQLPreview';
import { useMetadataQuery, useCompiledSqlQuery, MetadataOption } from 'queries';
import { OrderBy } from './OrderBy/OrderBy';
import { FilterField } from './FilterField/FilterField';
import { useQueryEditorHandlers } from '../hooks/useQueryEditorHandlers';
import { buildCubeQueryJson } from '../utils/buildCubeQuery';
import { detectUnsupportedFeatures } from '../utils/detectUnsupportedFeatures';
import { JsonQueryViewer } from './JsonQueryViewer';

type Props = QueryEditorProps<DataSource, CubeQuery, CubeDataSourceOptions>;

/**
 * Builds the Cube query JSON with proper React reactivity for template service
 * values (ad-hoc filters, $cubeTimeDimension, $__from/$__to) that are read
 * inside buildCubeQueryJson via normalizeCubeQuery.
 *
 * Without surfacing these as useMemo dependencies, the SQL preview goes stale
 * when dashboard-level values change. See grafana/semantic-layer#13.
 */
function useCubeQueryJson(query: CubeQuery, datasource: DataSource): string {
  const templateSrv = getTemplateSrv();
  const withAdHoc = templateSrv as ReturnType<typeof getTemplateSrv> & {
    getAdhocFilters?: (name: string) => unknown[];
  };
  const adHocFiltersKey = JSON.stringify(withAdHoc.getAdhocFilters?.(datasource.name) ?? []);
  const cubeTimeDimension = templateSrv.replace('$cubeTimeDimension', {});
  const fromTime = templateSrv.replace('$__from', {});
  const toTime = templateSrv.replace('$__to', {});

  return useMemo(
    () => buildCubeQueryJson(query, datasource),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, datasource, adHocFiltersKey, cubeTimeDimension, fromTime, toTime]
  );
}

export function QueryEditor(props: Props) {
  const { query, datasource } = props;
  const unsupportedFeatures = useMemo(() => detectUnsupportedFeatures(query), [query]);

  if (unsupportedFeatures.length > 0) {
    return <UnsupportedQueryEditor query={query} datasource={datasource} reasons={unsupportedFeatures} />;
  }

  return <VisualQueryEditor {...props} />;
}

/**
 * Shown when the query contains features the visual builder cannot represent.
 * Displays the JSON viewer and SQL preview, but skips the metadata fetch
 * since the visual builder controls are not rendered.
 */
function UnsupportedQueryEditor({
  query,
  datasource,
  reasons,
}: {
  query: CubeQuery;
  datasource: DataSource;
  reasons: string[];
}) {
  const cubeQueryJson = useCubeQueryJson(query, datasource);
  const { data: compiledSql, isLoading: compiledSqlIsLoading } = useCompiledSqlQuery({
    datasource,
    cubeQueryJson,
  });

  return (
    <>
      <JsonQueryViewer query={query} reasons={reasons} />

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
  const cubeQueryJson = useCubeQueryJson(query, datasource);

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

      <Field label="Filters" description="Filter results by field values">
        <FilterField
          filters={query.filters?.filter((f): f is CubeFilter => isCubeFilter(f))}
          dimensions={metadata.dimensions}
          onChange={onFiltersChange}
          datasource={datasource}
        />
      </Field>
      <div className={styles.filterHint}>
        <Text color="secondary" italic>
          Need advanced filters? Comparison operators, measure filters, and AND/OR groups
          are supported via the panel JSON editor.{' '}
          <TextLink href="https://cube.dev/docs/product/apis-integrations/rest-api/query-format#filters-format" external>
            Cube filter docs
          </TextLink>
        </Text>
      </div>

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
    filterHint: css({
      marginTop: theme.spacing(-0.5),
      marginBottom: theme.spacing(1),
      paddingLeft: theme.spacing(2),
    }),
  };
};
