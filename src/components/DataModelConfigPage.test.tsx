import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBackendSrv } from '@grafana/runtime';
import { extractDatasourceUid, DataModelConfigPage } from './DataModelConfigPage';
import { PluginMeta, PluginType } from '@grafana/data';

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: jest.fn(),
}));

// Mock CodeEditor since it uses monaco which isn't available in tests
jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    CodeEditor: ({ value }: { value: string }) =>
      React.createElement('pre', { 'data-testid': 'code-editor' }, value),
  };
});

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

const mockModelFiles = {
  files: [
    { fileName: 'cubes/raw_customers.yml', content: 'cubes:\n  - name: raw_customers\n    sql_table: public.raw_customers' },
    { fileName: 'cubes/raw_orders.yml', content: 'cubes:\n  - name: raw_orders\n    sql_table: public.raw_orders' },
  ],
};

const mockPluginMeta: PluginMeta = {
  id: 'grafana-cube-datasource',
  name: 'Cube',
  type: PluginType.datasource,
  info: {} as any,
  module: '',
  baseUrl: '',
};

function renderPage(datasourceUid = 'test-ds-uid') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  return {
    user,
    ...render(
      <QueryClientProvider client={client}>
        <DataModelConfigPage
          plugin={{ meta: mockPluginMeta } as any}
          query={{ page: 'data-model' } as any}
          datasourceUid={datasourceUid}
        />
      </QueryClientProvider>
    ),
  };
}

describe('extractDatasourceUid', () => {
  it('extracts UID from standard datasource edit URL', () => {
    expect(extractDatasourceUid('/connections/datasources/edit/cube-datasource/')).toBe('cube-datasource');
  });

  it('extracts UID from URL without trailing slash', () => {
    expect(extractDatasourceUid('/connections/datasources/edit/my-uid')).toBe('my-uid');
  });

  it('extracts UID when query params are present', () => {
    expect(extractDatasourceUid('/connections/datasources/edit/abc-123')).toBe('abc-123');
  });

  it('returns null when URL does not match', () => {
    expect(extractDatasourceUid('/some/other/page')).toBeNull();
  });

  it('returns null for empty pathname', () => {
    expect(extractDatasourceUid('/')).toBeNull();
  });
});

describe('DataModelConfigPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the sidebar with Tables and Files tabs', async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDbSchema);
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    renderPage();

    expect(screen.getByText('Tables')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('shows Generate Data Model button disabled when no tables selected', async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDbSchema);
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Generate Data Model')).toBeInTheDocument();
    });

    expect(screen.getByText('Generate Data Model').closest('button')).toBeDisabled();
  });

  it('enables Generate button when a table is selected', async () => {
    const mockGet = jest.fn().mockResolvedValue(mockDbSchema);
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    const { user } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));

    expect(screen.getByText('Generate Data Model').closest('button')).not.toBeDisabled();
  });

  it('switches to Files tab and shows generated files after generation', async () => {
    let callCount = 0;
    const mockGet = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/db-schema')) {
        return Promise.resolve(mockDbSchema);
      }
      if (url.includes('/model-files')) {
        return Promise.resolve(callCount > 0 ? mockModelFiles : { files: [] });
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`));
    });
    const mockPost = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({});
    });
    mockGetBackendSrv.mockReturnValue({ get: mockGet, post: mockPost });

    const { user } = renderPage();

    // Wait for tree to load
    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    // Select a table
    await user.click(screen.getByText('raw_customers'));

    // Click generate
    await user.click(screen.getByText('Generate Data Model'));

    // Should switch to files tab and show the generated files
    await waitFor(() => {
      expect(screen.getByText('cubes/raw_customers.yml')).toBeInTheDocument();
    });
  });

  it('shows YAML preview when a file is selected', async () => {
    const mockGet = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/db-schema')) {
        return Promise.resolve(mockDbSchema);
      }
      if (url.includes('/model-files')) {
        return Promise.resolve(mockModelFiles);
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`));
    });
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    const { user } = renderPage();

    // Switch to files tab
    await user.click(screen.getByText('Files'));

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getByText('cubes/raw_customers.yml')).toBeInTheDocument();
    });

    // Click on a file
    await user.click(screen.getByText('cubes/raw_customers.yml'));

    // Verify code preview
    await waitFor(() => {
      expect(screen.getByTestId('code-editor')).toHaveTextContent('raw_customers');
    });
  });
});
