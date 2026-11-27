import React, { useCallback, useMemo } from 'react';
import { InlineField, Input, Alert, MultiSelect, Text, Field, TextLink, useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { AdHocVariableFilter, GrafanaTheme2, QueryEditorProps, SelectableValue } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { DataSource } from '../datasource';
import { CubeDataSourceOptions, CubeQuery, CubeFilter, isCubeFilter } from '../types';
import { SQLPreview } from './SQLPreview';
import { useMetadataQuery, useCompiledSqlQuery, MetadataOption } from '../queries';
import { OrderBy } from './OrderBy/OrderBy';
import { FilterField } from './FilterField/FilterField';
import { useQueryEditorHandlers } from '../hooks/useQueryEditorHandlers';
import { buildCubeQueryJson, BuiltCubeQuery } from '../utils/buildCubeQuery';
import { resolveAdHocFilters } from '../utils/adHocFilters';
import { detectUnsupportedFeatures } from '../utils/detectUnsupportedFeatures';
import { decorateWithViewSelection, getViewSelectionState } from '../utils/viewSelection';
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
function useCubeQueryJson(
  query: CubeQuery,
  datasource: DataSource,
  // The editor's props.data.request.filters — the AdHoc filters the last query
  // actually ran with (Torkel's supported editor path, issue #506).
  requestFilters?: AdHocVariableFilter[]
): BuiltCubeQuery {
  const templateSrv = getTemplateSrv();
  // Snapshot the RESOLVED AdHoc filters so the SQL preview re-renders when the
  // applied filters change. Precedence mirrors the runtime resolveAdHocFilters
  // (issues #127/#506):
  //   1. props.data.request.filters (post-run, canonical: matches execution)
  //   2. getTemplateSrv().getVariables() adhoc vars (immediate / pre-run state)
  //   3. deprecated getAdhocFilters() (older Grafana only)
  // GOTCHA: data.request.filters is only populated AFTER a query runs; on first
  // open / pre-run it is empty/undefined, so resolveAdHocFilters falls back to
  // getVariables() and the preview still shows AdHoc WHERE before first execution.
  const adHocFiltersKey = JSON.stringify(
    resolveAdHocFilters({ name: datasource.name, uid: datasource.uid }, requestFilters)
  );
  const cubeTimeDimension = templateSrv.replace('$cubeTimeDimension', {});
  const fromTime = templateSrv.replace('$__from', {});
  const toTime = templateSrv.replace('$__to', {});

  // Subscribe to metadata so the AdHoc view-scoping (and the "skipped N" hint)
  // re-renders once metadata loads, in BOTH the visual and unsupported/JSON
  // editor modes (issue #307). react-query dedupes the fetch.
  const { data: metadata } = useMetadataQuery({ datasource });

  return useMemo(
    () => buildCubeQueryJson(query, datasource, metadata, requestFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, datasource, adHocFiltersKey, cubeTimeDimension, fromTime, toTime, metadata]
  );
}

export function QueryEditor(props: Props) {
  const { query, datasource } = props;
  const requestFilters = props.data?.request?.filters;
  const unsupportedFeatures = useMemo(() => detectUnsupportedFeatures(query), [query]);

  if (unsupportedFeatures.length > 0) {
    return (
      <UnsupportedQueryEditor
        query={query}
        datasource={datasource}
        reasons={unsupportedFeatures}
        requestFilters={requestFilters}
      />
    );
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
  requestFilters,
}: {
  query: CubeQuery;
  datasource: DataSource;
  reasons: string[];
  requestFilters?: AdHocVariableFilter[];
}) {
  const { json: cubeQueryJson, droppedAdHocFilters } = useCubeQueryJson(query, datasource, requestFilters);
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
        droppedAdHocFilters={droppedAdHocFilters}
      />
    </>
  );
}

/**
 * The full visual query builder with dimensions, measures, filters,
 * ordering, and SQL preview.
 */
function VisualQueryEditor({ query, onChange, onRunQuery, datasource, data: panelData }: Props) {
  const styles = useStyles2(getStyles);
  const requestFilters = panelData?.request?.filters;
  const { json: cubeQueryJson, droppedAdHocFilters } = useCubeQueryJson(query, datasource, requestFilters);

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

  // Cube views are the curated public query surface. Keep visual-builder
  // queries scoped to one view so model authors control the intended join path.
  const viewSelectionState = useMemo(
    () => getViewSelectionState(query, metadata),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.dimensions, query.measures, query.filters, metadata]
  );
  const dimensionOptions = useMemo(
    () => decorateWithViewSelection(metadata.dimensions, viewSelectionState),
    [metadata.dimensions, viewSelectionState]
  );
  const measureOptions = useMemo(
    () => decorateWithViewSelection(metadata.measures, viewSelectionState),
    [metadata.measures, viewSelectionState]
  );

  const filterOption = useCallback((option: SelectableValue<string> & { data?: SelectableValue<string> }, searchQuery: string) => {
    const q = searchQuery.toLowerCase();
    const selectable = option.data?.value !== undefined ? option.data : option;
    const label = selectable.label?.toLowerCase() ?? option.label?.toLowerCase() ?? '';
    const originalDescription = selectable.data?.originalDescription;
    const desc = (typeof originalDescription === 'string' ? originalDescription : selectable.description ?? '').toLowerCase();
    return label.includes(q) || desc.includes(q);
  }, []);

  // All selected dimensions and measures with their labels (for OrderBy component)
  const availableOrderOptions = useMemo(() => {
    const selectedFields = [...(query.dimensions || []), ...(query.measures || [])];
    return selectedFields.map((field) => ({ label: field.split('.').pop() || field, value: field }));
  }, [query.dimensions, query.measures]);

  return (
    <>
      {metadataIsError && <Alert title="Error fetching metadata" severity="error" />}
      {!metadataIsLoading && !metadataIsError && metadata.dimensions.length === 0 && metadata.measures.length === 0 && (
        <Alert title="No views found" severity="info">
          Define{' '}
          <TextLink href="https://cube.dev/docs/product/data-modeling/concepts/data-model-syntax#views" external>
            views
          </TextLink>{' '}
          in your Cube data model to expose dimensions and measures.
        </Alert>
      )}
      <InlineField label="Dimensions" labelWidth={16} tooltip="Select the dimensions to group your data by" grow>
        <div className={styles.multiSelectWrapper}>
          <div className={styles.multiSelectContainer}>
            <MultiSelect
              aria-label="Dimensions"
              options={dimensionOptions}
              value={selectedDimensions}
              onChange={(v) => onDimensionOrMeasureChange(v, 'dimensions')}
              filterOption={filterOption}
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
              options={measureOptions}
              value={selectedMeasures}
              onChange={(v) => onDimensionOrMeasureChange(v, 'measures')}
              filterOption={filterOption}
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
          dimensions={dimensionOptions}
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
        droppedAdHocFilters={droppedAdHocFilters}
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
