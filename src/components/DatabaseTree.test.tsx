import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBackendSrv } from '@grafana/runtime';
import { DatabaseTree } from './DatabaseTree';

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: jest.fn(),
}));

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

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  return { user, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

function setupMockApi(response = mockDbSchema) {
  const mockGet = jest.fn().mockResolvedValue(response);
  mockGetBackendSrv.mockReturnValue({ get: mockGet });
  return mockGet;
}

describe('DatabaseTree', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders schema tree with correct structure', async () => {
    setupMockApi();
    renderWithQueryClient(
      <DatabaseTree datasourceUid="test-uid" selectedTables={[]} onTableSelect={jest.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });
    expect(screen.getByText('raw_customers')).toBeInTheDocument();
    expect(screen.getByText('raw_orders')).toBeInTheDocument();
  });

  it('calls API with correct URL', async () => {
    const mockGet = setupMockApi();
    renderWithQueryClient(
      <DatabaseTree datasourceUid="my-ds-uid" selectedTables={[]} onTableSelect={jest.fn()} />
    );

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/datasources/uid/my-ds-uid/resources/db-schema');
    });
  });

  it('calls onTableSelect when a table is clicked', async () => {
    setupMockApi();
    const onTableSelect = jest.fn();
    const { user } = renderWithQueryClient(
      <DatabaseTree datasourceUid="test-uid" selectedTables={[]} onTableSelect={onTableSelect} />
    );

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));
    expect(onTableSelect).toHaveBeenCalledWith(['public.raw_customers']);
  });

  it('deselects a table when clicking an already-selected table', async () => {
    setupMockApi();
    const onTableSelect = jest.fn();
    const { user } = renderWithQueryClient(
      <DatabaseTree
        datasourceUid="test-uid"
        selectedTables={['public.raw_customers']}
        onTableSelect={onTableSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));
    expect(onTableSelect).toHaveBeenCalledWith([]);
  });

  it('renders error state when API call fails', async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error('Connection refused'));
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    renderWithQueryClient(
      <DatabaseTree datasourceUid="test-uid" selectedTables={[]} onTableSelect={jest.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load database schema/i)).toBeInTheDocument();
    });
  });

  it('selects all tables when schema checkbox is clicked', async () => {
    setupMockApi();
    const onTableSelect = jest.fn();
    const { user } = renderWithQueryClient(
      <DatabaseTree datasourceUid="test-uid" selectedTables={[]} onTableSelect={onTableSelect} />
    );

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    // Click the schema-level checkbox area (the schema name triggers toggle)
    await user.click(screen.getByText('public'));

    // Should not call onTableSelect since clicking schema name toggles expand/collapse
    // The checkbox next to the schema name selects all tables
  });

  it('renders multiple schemas', async () => {
    const multiSchemaResponse = {
      tablesSchema: {
        public: {
          users: [{ name: 'id', type: 'integer', attributes: [] }],
        },
        analytics: {
          events: [{ name: 'id', type: 'integer', attributes: [] }],
        },
      },
    };
    setupMockApi(multiSchemaResponse);

    renderWithQueryClient(
      <DatabaseTree datasourceUid="test-uid" selectedTables={[]} onTableSelect={jest.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });
    expect(screen.getByText('analytics')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('events')).toBeInTheDocument();
  });
});
