import React, { useState, useEffect, useMemo } from 'react';
import {
  InlineField,
  Input,
  Combobox,
  IconButton,
  Tooltip,
  useStyles2,
  MultiCombobox,
  ComboboxOption,
} from '@grafana/ui';
import { QueryEditorProps, SelectableValue, GrafanaTheme2 } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { css } from '@emotion/css';
import { DataSource } from '../datasource';
import { CubeFilter, MyDataSourceOptions, MyQuery } from '../types';
import { SQLPreview } from './SQLPreview';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

const getStyles = (theme: GrafanaTheme2) => ({
  // Container that looks like a MultiSelect input
  orderInputContainer: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${theme.spacing(0.5)};
    min-height: 32px;
    padding: ${theme.spacing(0.25)} ${theme.spacing(0.5)};
    background: ${theme.components.input.background};
    border: 1px solid ${theme.components.input.borderColor};
    border-radius: ${theme.shape.radius.default};
    width: 800px; /* Match MultiSelect width={100} */

    &:focus-within {
      outline: 2px solid ${theme.colors.primary.main};
      outline-offset: -2px;
    }
  `,
  // Pill styling matching MultiSelect pills
  orderPill: css`
    display: inline-flex;
    align-items: center;
    gap: ${theme.spacing(0.25)};
    padding: ${theme.spacing(0.25)} ${theme.spacing(0.5)};
    background: ${theme.colors.background.secondary};
    border-radius: ${theme.shape.radius.default};
    font-size: ${theme.typography.bodySmall.fontSize};
    line-height: 1;
    white-space: nowrap;
  `,
  // Direction toggle button inside the pill
  directionButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: ${theme.spacing(0.25)};
    margin-left: ${theme.spacing(0.25)};
    border: none;
    background: transparent;
    color: ${theme.colors.text.secondary};
    cursor: pointer;
    border-radius: ${theme.shape.radius.default};
    font-size: ${theme.typography.bodySmall.fontSize};
    line-height: 1;

    &:hover {
      background: ${theme.colors.action.hover};
      color: ${theme.colors.text.primary};
    }
  `,
  // Combobox wrapper to remove its border (it's inside our container)
  comboboxWrapper: css`
    flex: 1;
    min-width: 100px;

    & > div {
      border: none !important;
      background: transparent !important;
      min-height: auto !important;
      padding: 0 !important;
    }

    & input {
      background: transparent !important;
    }
  `,
  // Empty state text
  emptyState: css`
    color: ${theme.colors.text.secondary};
    font-style: italic;
    font-size: ${theme.typography.bodySmall.fontSize};
    padding: ${theme.spacing(0.5)};
  `,
});

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const styles = useStyles2(getStyles);

  // Dimension and measure metadata state
  const [dimensionOptions, setDimensionOptions] = useState<Array<ComboboxOption<string>>>([]);
  const [measureOptions, setMeasureOptions] = useState<Array<ComboboxOption<string>>>([]);
  const [metadataLoading, setMetadataLoading] = useState<boolean>(true);

  // SQL compilation state
  const [compiledSQL, setCompiledSQL] = useState<string>('');
  const [sqlCompiling, setSqlCompiling] = useState<boolean>(false);

  // Fetch metadata on component mount
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setMetadataLoading(true);
        const metadata = await datasource.getMetadata();
        setDimensionOptions(metadata.dimensions || []);
        setMeasureOptions(metadata.measures || []);
      } catch (error) {
        console.error('Failed to fetch metadata:', error);
        setDimensionOptions([]);
        setMeasureOptions([]);
      } finally {
        setMetadataLoading(false);
      }
    };

    fetchMetadata();
  }, [datasource]);

  // Get selected values from query
  const selectedDimensions = dimensionOptions.filter((opt) => opt.value && query.dimensions?.includes(opt.value));
  const selectedMeasures = measureOptions.filter((opt) => opt.value && query.measures?.includes(opt.value));
  const currentLimit = query.limit ?? '';

  // Fields available for ordering (only selected dimensions and measures)
  const availableOrderFields = useMemo(() => {
    const selectedFields = [...(query.dimensions || []), ...(query.measures || [])];
    const alreadyOrdered = Object.keys(query.order || {});
    return selectedFields
      .filter((field) => !alreadyOrdered.includes(field))
      .map((field) => ({ label: field.split('.').pop() || field, value: field }));
  }, [query.dimensions, query.measures, query.order]);

  // Current order entries
  const orderEntries = useMemo(() => {
    if (!query.order) {
      return [];
    }
    return Object.entries(query.order).map(([field, direction]) => ({ field, direction }));
  }, [query.order]);

  // Helper function to update query and trigger re-evaluation
  const updateQueryAndRun = (updates: Partial<MyQuery>) => {
    onChange({ ...query, ...updates });
    onRunQuery();
  };

  const onDimensionsChange = (values: Array<SelectableValue<string>>) => {
    const dimensions = values.map((v) => v.value).filter(Boolean) as string[];
    updateQueryAndRun({ dimensions });
  };

  const onMeasuresChange = (values: Array<SelectableValue<string>>) => {
    const measures = values.map((v) => v.value).filter(Boolean) as string[];
    updateQueryAndRun({ measures });
  };

  const onLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const limit = value === '' ? undefined : parseInt(value, 10);

    // Only update if the value is empty or a valid positive integer
    if (value === '' || (!isNaN(limit!) && limit! > 0)) {
      updateQueryAndRun({ limit });
    }
  };

  const onAddOrder = (field: string, direction: 'asc' | 'desc' = 'asc') => {
    const newOrder = { ...(query.order || {}), [field]: direction };
    updateQueryAndRun({ order: newOrder });
  };

  const onRemoveOrder = (field: string) => {
    if (!query.order) {
      return;
    }
    const newOrder = { ...query.order };
    delete newOrder[field];
    updateQueryAndRun({ order: Object.keys(newOrder).length > 0 ? newOrder : undefined });
  };

  const onToggleOrderDirection = (field: string) => {
    if (!query.order || !query.order[field]) {
      return;
    }
    const newDirection = query.order[field] === 'asc' ? 'desc' : 'asc';
    updateQueryAndRun({ order: { ...query.order, [field]: newDirection } });
  };

  // Build the Cube query JSON for SQL compilation (memoized for dependency tracking)
  // Includes AdHoc filters and $cubeTimeDimension so the preview matches what actually runs
  const cubeQueryJson = useMemo(() => {
    if (!query.dimensions?.length && !query.measures?.length) {
      return '';
    }
    const cubeQuery: Record<string, unknown> = {};
    if (query.dimensions?.length) {
      cubeQuery.dimensions = query.dimensions;
    }
    if (query.measures?.length) {
      cubeQuery.measures = query.measures;
    }

    // Start with query-level time dimensions
    let timeDimensions = query.timeDimensions?.length ? [...query.timeDimensions] : [];

    // If no time dimensions in query, check for $cubeTimeDimension dashboard variable
    if (timeDimensions.length === 0) {
      const templateSrv = getTemplateSrv();
      const dashboardTimeDimension = templateSrv.replace('$cubeTimeDimension', {});

      // Only add if the variable was actually replaced (not returned as literal '$cubeTimeDimension')
      if (dashboardTimeDimension && dashboardTimeDimension !== '$cubeTimeDimension') {
        const fromTime = templateSrv.replace('$__from', {});
        const toTime = templateSrv.replace('$__to', {});

        // $__from and $__to are milliseconds timestamps - convert to ISO strings for Cube
        if (fromTime && toTime && fromTime !== '$__from' && toTime !== '$__to') {
          const fromTimestamp = parseInt(fromTime, 10);
          const toTimestamp = parseInt(toTime, 10);

          // Validate timestamps are valid numbers before creating Date objects
          if (!isNaN(fromTimestamp) && !isNaN(toTimestamp)) {
            const fromDate = new Date(fromTimestamp).toISOString();
            const toDate = new Date(toTimestamp).toISOString();

            timeDimensions = [
              {
                dimension: dashboardTimeDimension,
                dateRange: [fromDate, toDate],
              },
            ];
          }
        }
      }
    }

    if (timeDimensions.length > 0) {
      cubeQuery.timeDimensions = timeDimensions;
    }

    if (query.limit) {
      cubeQuery.limit = query.limit;
    }

    // Combine query-level filters with AdHoc filters
    let filters: CubeFilter[] = query.filters?.length ? [...query.filters] : [];

    // Get AdHoc filters and convert to Cube format
    const templateSrv = getTemplateSrv();
    const adHocFilters = (templateSrv as any).getAdhocFilters
      ? (templateSrv as any).getAdhocFilters(datasource.name)
      : [];

    if (adHocFilters && adHocFilters.length > 0) {
      const cubeFilters: CubeFilter[] = adHocFilters.map((filter: any) => ({
        member: filter.key,
        operator: datasource.mapOperator(filter.operator),
        // Multi-value operators (=| and !=|) use the values array; single-value operators use value
        values: filter.values && filter.values.length > 0 ? filter.values : [filter.value],
      }));

      filters = [...filters, ...cubeFilters];
    }

    if (filters.length > 0) {
      cubeQuery.filters = filters;
    }

    if (query.order) {
      cubeQuery.order = query.order;
    }
    return JSON.stringify(cubeQuery);
  }, [query.dimensions, query.measures, query.timeDimensions, query.limit, query.filters, query.order, datasource]);

  // Fetch compiled SQL when query changes
  useEffect(() => {
    const fetchCompiledSQL = async () => {
      if (!cubeQueryJson) {
        setCompiledSQL('');
        return;
      }

      try {
        setSqlCompiling(true);
        // Call our backend to get compiled SQL from Cube
        const response = await datasource.getResource('sql', { query: cubeQueryJson });

        if (response.sql) {
          setCompiledSQL(response.sql);
        } else {
          setCompiledSQL('-- No SQL returned from Cube API');
        }
      } catch (error) {
        console.error('Failed to fetch compiled SQL:', error);
        // API error - clear the SQL preview
        setCompiledSQL('');
      } finally {
        setSqlCompiling(false);
      }
    };

    fetchCompiledSQL();
  }, [cubeQueryJson, datasource]);

  return (
    <>
      <InlineField label="Dimensions" labelWidth={16} tooltip="Select the dimensions to group your data by">
        <MultiCombobox
          aria-label="Dimensions"
          options={dimensionOptions}
          value={selectedDimensions}
          onChange={onDimensionsChange}
          loading={metadataLoading}
          placeholder={metadataLoading ? 'Loading dimensions...' : 'Select dimensions...'}
        />
      </InlineField>

      <InlineField label="Measures" labelWidth={16} tooltip="Select the measures to aggregate">
        <MultiCombobox
          aria-label="Measures"
          options={measureOptions}
          value={selectedMeasures}
          onChange={onMeasuresChange}
          loading={metadataLoading}
          placeholder={metadataLoading ? 'Loading measures...' : 'Select measures...'}
        />
      </InlineField>

      <InlineField label="Row Limit" labelWidth={16} tooltip="Maximum number of rows to return (optional)">
        <Input
          aria-label="Row Limit"
          type="number"
          value={currentLimit}
          onChange={onLimitChange}
          placeholder="Enter row limit..."
          min={1}
        />
      </InlineField>

      <InlineField label="Order By" labelWidth={16} tooltip="Order results by selected fields">
        <div className={styles.orderInputContainer}>
          {/* Render order pills */}
          {orderEntries.map(({ field, direction }) => (
            <div key={field} className={styles.orderPill}>
              <span>{field.split('.').pop()}</span>
              <Tooltip content={`Click to change to ${direction === 'asc' ? 'descending' : 'ascending'}`}>
                <button
                  className={styles.directionButton}
                  onClick={() => onToggleOrderDirection(field)}
                  aria-label={`Sort ${field} ${direction === 'asc' ? 'ascending' : 'descending'}, click to toggle`}
                >
                  {direction === 'asc' ? '↑' : '↓'}
                </button>
              </Tooltip>
              <Tooltip content="Remove">
                <IconButton
                  name="times"
                  size="xs"
                  aria-label={`Remove ${field} from order`}
                  onClick={() => onRemoveOrder(field)}
                />
              </Tooltip>
            </div>
          ))}

          {/* Combobox to add new order fields */}
          {availableOrderFields.length > 0 && (
            <div className={styles.comboboxWrapper}>
              <Combobox
                aria-labelledby="order-by-label"
                options={availableOrderFields}
                value={null}
                onChange={(option) => {
                  if (option?.value) {
                    onAddOrder(option.value, 'asc');
                  }
                }}
                placeholder={orderEntries.length === 0 ? 'Add field to order by...' : 'Add field...'}
                width="auto"
                minWidth={15}
              />
            </div>
          )}

          {/* Empty state when no dimensions/measures selected */}
          {availableOrderFields.length === 0 && orderEntries.length === 0 && (
            <span className={styles.emptyState}>Select dimensions or measures first</span>
          )}
        </div>
      </InlineField>

      {sqlCompiling && (
        <InlineField label="" labelWidth={16}>
          <div>Compiling SQL...</div>
        </InlineField>
      )}

      <SQLPreview
        sql={compiledSQL}
        exploreSqlDatasourceUid={datasource.instanceSettings?.jsonData?.exploreSqlDatasourceUid}
      />
    </>
  );
}
