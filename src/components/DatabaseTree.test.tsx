// Mock @grafana/runtime BEFORE any imports (testUtils imports DataSource which needs this)
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: jest.fn(),
  DataSourceWithBackend: jest.fn().mockImplementation(() => ({})),
  getTemplateSrv: jest.fn(() => ({ replace: jest.fn((v: string) => v), getAdhocFilters: jest.fn(() => []) })),
}));

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { setup } from 'testUtils';
import { DatabaseTree } from './DatabaseTree';
import { getBackendSrv } from '@grafana/runtime';

const mockGetBackendSrv = getBackendSrv as jest.Mock;

const mockDbSchema = {
  tablesSchema: {
    public: {
      raw_customers: [
        { name: 'id', type: 'integer', attributes: [] },
        { name: 'first_name', type: 'character varying', attributes: [] },
      ],
      raw_orders: [
        { name: 'id', type: 'integer', attributes: [] },
        { name: 'status', type: 'character varying', attributes: [] },
      ],
    },
  },
};

describe('DatabaseTree', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockApiSuccess(data = mockDbSchema) {
    mockGetBackendSrv.mockReturnValue({
      get: jest.fn().mockResolvedValue(data),
    });
  }

  function mockApiError(message = 'Network error') {
    mockGetBackendSrv.mockReturnValue({
      get: jest.fn().mockRejectedValue(new Error(message)),
    });
  }

  it('renders loading state while fetching schema', () => {
    mockGetBackendSrv.mockReturnValue({
      get: jest.fn().mockReturnValue(new Promise(() => {})),
    });

    setup(<DatabaseTree datasourceUid="test-uid" onTableSelect={jest.fn()} selectedTables={[]} />);

    expect(screen.getByText('Loading database schema...')).toBeInTheDocument();
  });

  it('renders schema tree with correct structure', async () => {
    mockApiSuccess();

    setup(<DatabaseTree datasourceUid="test-uid" onTableSelect={jest.fn()} selectedTables={[]} />);

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });
    expect(screen.getByText('raw_customers')).toBeInTheDocument();
    expect(screen.getByText('raw_orders')).toBeInTheDocument();
  });

  it('calls onTableSelect when a table is clicked', async () => {
    mockApiSuccess();
    const onTableSelect = jest.fn();

    const { user } = setup(
      <DatabaseTree datasourceUid="test-uid" onTableSelect={onTableSelect} selectedTables={[]} />
    );

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));

    expect(onTableSelect).toHaveBeenCalledWith(['public.raw_customers']);
  });

  it('deselects a table when clicking an already selected table', async () => {
    mockApiSuccess();
    const onTableSelect = jest.fn();

    const { user } = setup(
      <DatabaseTree
        datasourceUid="test-uid"
        onTableSelect={onTableSelect}
        selectedTables={['public.raw_customers']}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));

    expect(onTableSelect).toHaveBeenCalledWith([]);
  });

  it('renders error state when API call fails', async () => {
    mockApiError('Connection refused');

    setup(<DatabaseTree datasourceUid="test-uid" onTableSelect={jest.fn()} selectedTables={[]} />);

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });
  });

  it('selects all tables in a schema when schema checkbox is clicked', async () => {
    mockApiSuccess();
    const onTableSelect = jest.fn();

    const { user } = setup(
      <DatabaseTree datasourceUid="test-uid" onTableSelect={onTableSelect} selectedTables={[]} />
    );

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    // Click the schema checkbox (not the expand/collapse icon)
    await user.click(screen.getByLabelText('Select all tables in public'));

    expect(onTableSelect).toHaveBeenCalledWith(
      expect.arrayContaining(['public.raw_customers', 'public.raw_orders'])
    );
    expect(onTableSelect).toHaveBeenCalledWith(expect.any(Array));
    const callArgs = onTableSelect.mock.calls[0][0];
    expect(callArgs).toHaveLength(2);
  });

  it('deselects all tables in a schema when all are already selected', async () => {
    mockApiSuccess();
    const onTableSelect = jest.fn();

    const { user } = setup(
      <DatabaseTree
        datasourceUid="test-uid"
        onTableSelect={onTableSelect}
        selectedTables={['public.raw_customers', 'public.raw_orders']}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Select all tables in public'));

    expect(onTableSelect).toHaveBeenCalledWith([]);
  });

  it('selects remaining tables when schema is partially selected', async () => {
    mockApiSuccess();
    const onTableSelect = jest.fn();

    const { user } = setup(
      <DatabaseTree
        datasourceUid="test-uid"
        onTableSelect={onTableSelect}
        selectedTables={['public.raw_customers']}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Select all tables in public'));

    expect(onTableSelect).toHaveBeenCalledWith(
      expect.arrayContaining(['public.raw_customers', 'public.raw_orders'])
    );
  });
});
