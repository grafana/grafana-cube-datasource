import React, { act } from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryEditor } from './QueryEditor';
import { CubeQuery, Operator } from '../types';
import { getTemplateSrv } from '@grafana/runtime';
import { createMockDataSource, setup } from 'testUtils';

// Mock the SQLPreview component
jest.mock('./SQLPreview', () => ({
  SQLPreview: ({ sql }: { sql: string }) => <div data-testid="sql-preview">{sql}</div>,
}));

// Mock the JsonQueryEditor to avoid Monaco editor issues in tests
jest.mock('./JsonQueryEditor', () => ({
  JsonQueryEditor: ({ query, unsupportedFeatures }: any) => (
    <div data-testid="json-query-editor">
      <div data-testid="unsupported-features">{unsupportedFeatures.map((f: any) => f.description).join(', ')}</div>
      <pre data-testid="query-json">{JSON.stringify(query)}</pre>
    </div>
  ),
}));

// Mock @grafana/runtime for getTemplateSrv
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getTemplateSrv: jest.fn(),
}));

const mockGetTemplateSrv = getTemplateSrv as jest.Mock;

const createMockQuery = (overrides: Partial<CubeQuery> = {}): CubeQuery => ({
  refId: 'A',
  ...overrides,
});

describe('QueryEditor', () => {
  const mockOnChange = jest.fn();
  const mockOnRunQuery = jest.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
    mockOnRunQuery.mockClear();

    // Setup default mock for getTemplateSrv
    mockGetTemplateSrv.mockReturnValue({
      replace: jest.fn((value: string) => value), // Return value unchanged by default
      getAdhocFilters: jest.fn(() => []), // No ad-hoc filters by default
    });
  });

  it('should render loading state initially', async () => {
    const datasource = createMockDataSource();

    // Make metadata loading slower to catch the loading state
    let resolveMetadata: (value: any) => void;
    const metadataPromise = new Promise((resolve) => {
      resolveMetadata = resolve;
    });
    datasource.getMetadata = jest.fn().mockReturnValue(metadataPromise);

    const query = createMockQuery();

    setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

    // Should show loading state initially
    expect(screen.getByText('Loading dimensions...')).toBeInTheDocument();
    expect(screen.getByText('Loading measures...')).toBeInTheDocument();

    // Resolve the metadata
    await act(async () => {
      resolveMetadata!({
        dimensions: [
          { label: 'orders.status', value: 'orders.status' },
          { label: 'orders.customer', value: 'orders.customer' },
        ],
        measures: [
          { label: 'orders.count', value: 'orders.count' },
          { label: 'orders.total', value: 'orders.total' },
        ],
      });
    });

    // Should show normal state after metadata loads
    await waitFor(() => {
      expect(screen.getByText('Select dimensions...')).toBeInTheDocument();
      expect(screen.getByText('Select measures...')).toBeInTheDocument();
    });
  });

  it('should fetch and display metadata options', async () => {
    const mockMetadata = {
      dimensions: [
        { label: 'orders.status', value: 'orders.status' },
        { label: 'orders.customer', value: 'orders.customer' },
      ],
      measures: [
        { label: 'orders.count', value: 'orders.count' },
        { label: 'orders.total', value: 'orders.total' },
      ],
    };

    const datasource = createMockDataSource(mockMetadata);
    const query = createMockQuery();

    setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

    await waitFor(() => {
      expect(screen.getByText('Select dimensions...')).toBeInTheDocument();
      expect(screen.getByText('Select measures...')).toBeInTheDocument();
    });

    expect(datasource.getMetadata).toHaveBeenCalledTimes(1);
  });

  it('should handle metadata fetch errors gracefully', async () => {
    const datasource = createMockDataSource();
    datasource.getMetadata = jest.fn().mockRejectedValue(new Error('API Error'));

    const query = createMockQuery();

    setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

    await waitFor(() => {
      expect(screen.getByText('Select dimensions...')).toBeInTheDocument();
      expect(screen.getByText('Error fetching metadata')).toBeInTheDocument();
    });
  });

  it('should parse existing query and select appropriate options', async () => {
    const mockMetadata = {
      dimensions: [
        { label: 'orders.status', value: 'orders.status' },
        { label: 'orders.customer', value: 'orders.customer' },
      ],
      measures: [{ label: 'orders.count', value: 'orders.count' }],
    };

    const datasource = createMockDataSource(mockMetadata);
    const existingQuery = createMockQuery({
      dimensions: ['orders.status'],
      measures: ['orders.count'],
    });

    setup(
      <QueryEditor query={existingQuery} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />
    );

    await waitFor(() => {
      // When there are selected values, the placeholder text changes
      // Look for the selected values instead
      expect(screen.getByText('orders.status')).toBeInTheDocument();
      expect(screen.getByText('orders.count')).toBeInTheDocument();
    });

    // The component should have parsed the existing query
    // and selected the appropriate options
    expect(datasource.getMetadata).toHaveBeenCalledTimes(1);
  });

  it('should call onChange and onRunQuery when query parameters change', async () => {
    const mockMetadata = {
      dimensions: [
        { label: 'orders.status', value: 'orders.status' },
        { label: 'orders.customer', value: 'orders.customer' },
      ],
      measures: [{ label: 'orders.count', value: 'orders.count' }],
    };

    const datasource = createMockDataSource(mockMetadata);
    const query = createMockQuery();

    setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

    await waitFor(() => {
      expect(screen.getByText('Select dimensions...')).toBeInTheDocument();
    });

    // Note: Testing MultiSelect interactions directly is complex with react-select
    // Instead, we verify that updateQueryAndRun works correctly
    // by testing the limit input which uses the same pattern

    const limitInput = screen.getByLabelText('Row Limit');

    fireEvent.change(limitInput, { target: { value: '100' } });

    // Verify both onChange and onRunQuery are called together
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnRunQuery).toHaveBeenCalledTimes(1);

    // Test another change - modify the limit again
    fireEvent.change(limitInput, { target: { value: '200' } });

    // Verify both are called again (total of 2 times each)
    expect(mockOnChange).toHaveBeenCalledTimes(2);
    expect(mockOnRunQuery).toHaveBeenCalledTimes(2);
  });

  it('should compile SQL when query changes', async () => {
    const mockSQLResponse = {
      sql: 'SELECT status, COUNT(*) FROM orders GROUP BY status',
    };

    const datasource = createMockDataSource(null, mockSQLResponse);
    const query = createMockQuery({
      dimensions: ['orders.status'],
      measures: ['orders.count'],
    });

    setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

    await waitFor(() => {
      expect(screen.getByTestId('sql-preview')).toHaveTextContent(
        'SELECT status, COUNT(*) FROM orders GROUP BY status'
      );
    });

    expect(datasource.getResource).toHaveBeenCalledWith('sql', {
      query: JSON.stringify({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
      }),
    });
  });

  it('should show compiling state during SQL compilation', async () => {
    const datasource = createMockDataSource();

    // Make getResource return a promise that we can control
    let resolveSQL: (value: any) => void;
    const sqlPromise = new Promise((resolve) => {
      resolveSQL = resolve;
    });
    datasource.getResource = jest.fn().mockReturnValue(sqlPromise);

    const query = createMockQuery({
      dimensions: ['orders.status'],
      measures: ['orders.count'],
    });

    setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

    // Should show compiling state
    await waitFor(() => {
      expect(screen.getByText('Compiling SQL...')).toBeInTheDocument();
    });

    // Resolve the SQL compilation
    await act(async () => {
      resolveSQL!({ sql: 'SELECT * FROM orders' });
    });

    // Should hide compiling state
    await waitFor(() => {
      expect(screen.queryByText('Compiling SQL...')).not.toBeInTheDocument();
    });
  });

  describe('Row Limit Feature', () => {
    it('should render row limit input field', async () => {
      const datasource = createMockDataSource();
      const query = createMockQuery();

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Row Limit')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter row limit...')).toBeInTheDocument();
      });

      const limitInput = screen.getByLabelText('Row Limit');
      expect(limitInput).toHaveAttribute('type', 'number');
      expect(limitInput).toHaveAttribute('min', '1');
    });

    it('should display existing row limit value from query', async () => {
      const datasource = createMockDataSource();
      const queryWithLimit = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        limit: 100,
      });

      setup(
        <QueryEditor
          query={queryWithLimit}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={datasource}
        />
      );

      await waitFor(() => {
        const limitInput = screen.getByLabelText('Row Limit') as HTMLInputElement;
        expect(limitInput.value).toBe('100');
      });
    });

    it('should display empty value when no limit is set', async () => {
      const datasource = createMockDataSource();
      const queryWithoutLimit = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
      });

      setup(
        <QueryEditor
          query={queryWithoutLimit}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={datasource}
        />
      );

      await waitFor(() => {
        const limitInput = screen.getByLabelText('Row Limit') as HTMLInputElement;
        expect(limitInput.value).toBe('');
      });
    });

    it('should update query when valid limit is entered', async () => {
      const datasource = createMockDataSource();
      const query = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Row Limit')).toBeInTheDocument();
      });

      const limitInput = screen.getByLabelText('Row Limit');

      fireEvent.change(limitInput, { target: { value: '50' } });

      expect(mockOnChange).toHaveBeenCalledWith({
        ...query,
        limit: 50,
      });

      // Verify that onRunQuery is also called to re-evaluate the query
      expect(mockOnRunQuery).toHaveBeenCalledTimes(1);
    });

    it('should remove limit from query when input is cleared', async () => {
      const datasource = createMockDataSource();
      const queryWithLimit = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        limit: 100,
      });

      setup(
        <QueryEditor
          query={queryWithLimit}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={datasource}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Row Limit')).toBeInTheDocument();
      });

      const limitInput = screen.getByLabelText('Row Limit');

      fireEvent.change(limitInput, { target: { value: '' } });

      expect(mockOnChange).toHaveBeenCalledWith({
        ...queryWithLimit,
        limit: undefined,
      });

      // Verify that onRunQuery is also called to re-evaluate the query
      expect(mockOnRunQuery).toHaveBeenCalledTimes(1);
    });

    it('should not update query for invalid values', async () => {
      const datasource = createMockDataSource();
      const query = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Row Limit')).toBeInTheDocument();
      });

      const limitInput = screen.getByLabelText('Row Limit');

      // Test negative number
      fireEvent.change(limitInput, { target: { value: '-5' } });

      // Test zero
      fireEvent.change(limitInput, { target: { value: '0' } });

      // Test non-numeric value
      fireEvent.change(limitInput, { target: { value: 'abc' } });

      // onChange and onRunQuery should not have been called for invalid values
      expect(mockOnChange).not.toHaveBeenCalled();
      expect(mockOnRunQuery).not.toHaveBeenCalled();
    });

    it('should include limit in SQL compilation request', async () => {
      const mockSQLResponse = {
        sql: 'SELECT status, COUNT(*) FROM orders GROUP BY status LIMIT 25',
      };

      const datasource = createMockDataSource(null, mockSQLResponse);
      const queryWithLimit = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        limit: 25,
      });

      setup(
        <QueryEditor
          query={queryWithLimit}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={datasource}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('sql-preview')).toHaveTextContent(
          'SELECT status, COUNT(*) FROM orders GROUP BY status LIMIT 25'
        );
      });

      expect(datasource.getResource).toHaveBeenCalledWith('sql', {
        query: JSON.stringify({
          dimensions: ['orders.status'],
          measures: ['orders.count'],
          limit: 25,
        }),
      });
    });

    it('should include order in SQL compilation request', async () => {
      const mockSQLResponse = {
        sql: 'SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY COUNT(*) DESC',
      };

      const datasource = createMockDataSource(null, mockSQLResponse);
      const queryWithOrder = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        order: [['orders.count', 'desc']],
      });

      setup(
        <QueryEditor
          query={queryWithOrder}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={datasource}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('sql-preview')).toHaveTextContent(
          'SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY COUNT(*) DESC'
        );
      });

      expect(datasource.getResource).toHaveBeenCalledWith('sql', {
        query: JSON.stringify({
          dimensions: ['orders.status'],
          measures: ['orders.count'],
          order: [['orders.count', 'desc']],
        }),
      });
    });
  });

  describe('Selection Order Preservation', () => {
    it('should preserve user selection order for dimensions, not metadata order', async () => {
      // Metadata order: last_name, discount. User selects: discount, last_name (reversed)
      const mockMetadata = {
        dimensions: [
          { label: 'orders.last_name', value: 'orders.last_name' },
          { label: 'orders.discount', value: 'orders.discount' },
        ],
        measures: [],
      };
      const datasource = createMockDataSource(mockMetadata);
      const query = createMockQuery({ dimensions: ['orders.discount', 'orders.last_name'] });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      await waitFor(() => expect(screen.getByText('orders.discount')).toBeInTheDocument());

      const container = screen.getByLabelText('Dimensions').closest('[class*="grafana-select"]')?.parentElement;
      const html = container?.innerHTML || '';
      expect(html.indexOf('orders.discount')).toBeLessThan(html.indexOf('orders.last_name'));
    });

    it('should preserve user selection order for measures, not metadata order', async () => {
      // Metadata order: amount, total. User selects: total, amount (reversed)
      const mockMetadata = {
        dimensions: [],
        measures: [
          { label: 'orders.amount', value: 'orders.amount' },
          { label: 'orders.total', value: 'orders.total' },
        ],
      };
      const datasource = createMockDataSource(mockMetadata);
      const query = createMockQuery({ measures: ['orders.total', 'orders.amount'] });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      await waitFor(() => expect(screen.getByText('orders.total')).toBeInTheDocument());

      const container = screen.getByLabelText('Measures').closest('[class*="grafana-select"]')?.parentElement;
      const html = container?.innerHTML || '';
      expect(html.indexOf('orders.total')).toBeLessThan(html.indexOf('orders.amount'));
    });
  });

  describe('SQL Preview with AdHoc Filters and Dashboard Variables', () => {
    it('should include AdHoc filters in SQL compilation request', async () => {
      // Setup mock to return AdHoc filters
      mockGetTemplateSrv.mockReturnValue({
        replace: jest.fn((value: string) => value),
        getAdhocFilters: jest.fn(() => [
          { key: 'orders.status', operator: '=', value: 'completed' },
          { key: 'orders.customer', operator: '!=', value: 'test-user', values: [] },
        ]),
      });

      const mockSQLResponse = {
        sql: 'SELECT status FROM orders WHERE status = "completed"',
      };

      const datasource = createMockDataSource(null, mockSQLResponse);
      const query = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      await waitFor(() => {
        expect(datasource.getResource).toHaveBeenCalledWith('sql', {
          query: expect.stringContaining('"filters"'),
        });
      });

      // Parse the query to verify the filters
      const callArg = (datasource.getResource as jest.Mock).mock.calls.find((call: unknown[]) => call[0] === 'sql')?.[1]
        ?.query;
      const parsedQuery = JSON.parse(callArg);

      expect(parsedQuery.filters).toEqual([
        { member: 'orders.status', operator: 'equals', values: ['completed'] },
        { member: 'orders.customer', operator: 'notEquals', values: ['test-user'] },
      ]);
    });

    it('should include $cubeTimeDimension in SQL compilation when variable is set', async () => {
      const fromTimestamp = Date.now() - 3600000; // 1 hour ago
      const toTimestamp = Date.now();

      // Setup mock to return dashboard time dimension
      mockGetTemplateSrv.mockReturnValue({
        replace: jest.fn((value: string) => {
          if (value === '$cubeTimeDimension') {
            return 'orders.created_at';
          }
          if (value === '$__from') {
            return String(fromTimestamp);
          }
          if (value === '$__to') {
            return String(toTimestamp);
          }
          return value;
        }),
        getAdhocFilters: jest.fn(() => []),
      });

      const mockSQLResponse = {
        sql: 'SELECT status FROM orders WHERE created_at BETWEEN ...',
      };

      const datasource = createMockDataSource(null, mockSQLResponse);
      const query = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        // No timeDimensions in query - should use $cubeTimeDimension
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      await waitFor(() => {
        expect(datasource.getResource).toHaveBeenCalledWith('sql', {
          query: expect.stringContaining('"timeDimensions"'),
        });
      });

      // Parse the query to verify the time dimension
      const callArg = (datasource.getResource as jest.Mock).mock.calls.find((call: unknown[]) => call[0] === 'sql')?.[1]
        ?.query;
      const parsedQuery = JSON.parse(callArg);

      expect(parsedQuery.timeDimensions).toHaveLength(1);
      expect(parsedQuery.timeDimensions[0].dimension).toBe('orders.created_at');
      expect(parsedQuery.timeDimensions[0].dateRange).toHaveLength(2);
    });

    // Issue #147: Layered time dimension config (Panel Override → Dashboard Default → Datasource Default)
    // Note: Queries with timeDimensions now show the JSON editor instead of visual builder
    it('should show JsonQueryEditor for queries with panel-specific timeDimensions', async () => {
      // Dashboard has $cubeTimeDimension set to orders.created_at
      mockGetTemplateSrv.mockReturnValue({
        replace: jest.fn((value: string) => {
          if (value === '$cubeTimeDimension') {
            return 'orders.created_at';
          }
          return value;
        }),
        getAdhocFilters: jest.fn(() => []),
      });

      const datasource = createMockDataSource();

      // Panel has its own time dimension configured - this triggers JSON view
      const query = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        timeDimensions: [{ dimension: 'orders.updated_at', granularity: 'day' }],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      // Should show JSON editor instead of visual builder
      await waitFor(() => {
        expect(screen.getByTestId('json-query-editor')).toBeInTheDocument();
      });

      // Should indicate time dimensions as unsupported feature
      expect(screen.getByTestId('unsupported-features')).toHaveTextContent('Time dimensions');

      // Should show the query JSON including the time dimension
      const queryJson = screen.getByTestId('query-json').textContent || '';
      const parsedQuery = JSON.parse(queryJson);
      expect(parsedQuery.timeDimensions[0].dimension).toBe('orders.updated_at');
    });

    it('should combine query filters with AdHoc filters', async () => {
      // Setup mock to return AdHoc filters
      mockGetTemplateSrv.mockReturnValue({
        replace: jest.fn((value: string) => value),
        getAdhocFilters: jest.fn(() => [{ key: 'orders.region', operator: '=', value: 'US' }]),
      });

      const mockSQLResponse = { sql: 'SELECT status FROM orders WHERE ...' };
      const datasource = createMockDataSource(null, mockSQLResponse);

      const query = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        // Query has its own filters
        filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['active'] }],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      await waitFor(() => {
        expect(datasource.getResource).toHaveBeenCalled();
      });

      // Parse the query to verify both filters are included
      const callArg = (datasource.getResource as jest.Mock).mock.calls.find((call: unknown[]) => call[0] === 'sql')?.[1]
        ?.query;
      const parsedQuery = JSON.parse(callArg);

      expect(parsedQuery.filters).toHaveLength(2);
      expect(parsedQuery.filters).toContainEqual({
        member: 'orders.status',
        operator: 'equals',
        values: ['active'],
      });
      expect(parsedQuery.filters).toContainEqual({
        member: 'orders.region',
        operator: 'equals',
        values: ['US'],
      });
    });
  });

  describe('filter state management integration', () => {
    /**
     * Integration test to verify that adding a filter with multiple values
     * results in exactly one filter in the query state (not duplicates).
     *
     * Uses a stateful wrapper to simulate real Grafana prop updates, testing
     * the interaction between FilterField and useQueryEditorHandlers.
     */
    it('should not create duplicate filters when adding a filter with multiple values', async () => {
      const mockMetadata = {
        dimensions: [{ label: 'orders.status', value: 'orders.status' }],
        measures: [{ label: 'orders.count', value: 'orders.count' }],
      };

      const mockMemberValues = [{ text: 'completed' }, { text: 'pending' }, { text: 'shipped' }];

      const datasource = createMockDataSource(mockMetadata);
      datasource.getTagValues = jest.fn().mockResolvedValue(mockMemberValues);

      // Track all query states to detect duplicates
      const queryHistory: CubeQuery[] = [];
      let currentQuery = createMockQuery();

      // Stateful wrapper that updates props like real Grafana does
      const StatefulWrapper = () => {
        const [query, setQuery] = React.useState(currentQuery);

        const handleChange = (newQuery: CubeQuery) => {
          queryHistory.push({ ...newQuery });
          currentQuery = newQuery;
          setQuery(newQuery);
        };

        return (
          <QueryEditor
            query={query}
            onChange={handleChange}
            onRunQuery={mockOnRunQuery}
            datasource={datasource}
          />
        );
      };

      const { user } = setup(<StatefulWrapper />);

      // Wait for metadata to load
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add filter' })).toBeInTheDocument();
      });

      // Add a new filter
      await user.click(screen.getByRole('button', { name: 'Add filter' }));

      // Select field
      const fieldSelect = screen.getByRole('combobox', { name: 'Select field' });
      await user.click(fieldSelect);
      await user.click(await screen.findByText('orders.status'));

      // Select first value
      const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
      await user.click(valueSelect);
      await user.click(await screen.findByText('completed'));

      // Select second value
      await user.click(valueSelect);
      await user.click(await screen.findByText('pending'));

      // Verify final query state has exactly ONE filter with both values
      expect(currentQuery.filters).toHaveLength(1);
      expect(currentQuery.filters![0]).toEqual({
        member: 'orders.status',
        operator: 'equals',
        values: ['completed', 'pending'],
      });

      // Verify no intermediate states had duplicate filters (the reviewer's concern)
      for (const state of queryHistory) {
        const filterCount = state.filters?.length ?? 0;
        expect(filterCount).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('JsonQueryEditor mode for unsupported features', () => {
    it('should show JsonQueryEditor when query has dashboard variables in dimensions', async () => {
      const datasource = createMockDataSource();
      const query = createMockQuery({
        dimensions: ['$selectedDimension'],
        measures: ['orders.count'],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      expect(screen.getByTestId('json-query-editor')).toBeInTheDocument();
      expect(screen.getByTestId('unsupported-features')).toHaveTextContent('Dashboard variable in dimensions');
    });

    it('should show JsonQueryEditor when query has dashboard variables in measures', async () => {
      const datasource = createMockDataSource();
      const query = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['$selectedMeasure'],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      expect(screen.getByTestId('json-query-editor')).toBeInTheDocument();
      expect(screen.getByTestId('unsupported-features')).toHaveTextContent('Dashboard variable in measures');
    });

    it('should show JsonQueryEditor when query has complex filter groups', async () => {
      const datasource = createMockDataSource();
      const query = createMockQuery({
        dimensions: ['orders.status'],
        filters: [
          {
            or: [
              { member: 'orders.status', operator: 'equals', values: ['completed'] },
              { member: 'orders.status', operator: 'equals', values: ['pending'] },
            ],
          } as any,
        ],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      expect(screen.getByTestId('json-query-editor')).toBeInTheDocument();
      expect(screen.getByTestId('unsupported-features')).toHaveTextContent('Complex filter groups');
    });

    it('should show visual builder for queries without unsupported features', async () => {
      const datasource = createMockDataSource();
      const query = createMockQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['completed'] }],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      // Should NOT show JSON editor
      expect(screen.queryByTestId('json-query-editor')).not.toBeInTheDocument();

      // Should show visual builder elements
      await waitFor(() => {
        expect(screen.getByLabelText('Dimensions')).toBeInTheDocument();
        expect(screen.getByLabelText('Measures')).toBeInTheDocument();
      });
    });

    it('should show multiple unsupported features when query has several', async () => {
      const datasource = createMockDataSource();
      const query = createMockQuery({
        dimensions: ['$dim'],
        measures: ['$measure'],
        timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
      });

      setup(<QueryEditor query={query} onChange={mockOnChange} onRunQuery={mockOnRunQuery} datasource={datasource} />);

      expect(screen.getByTestId('json-query-editor')).toBeInTheDocument();
      const features = screen.getByTestId('unsupported-features').textContent || '';
      expect(features).toContain('Time dimensions');
      expect(features).toContain('Dashboard variable in dimensions');
      expect(features).toContain('Dashboard variable in measures');
    });
  });
});
