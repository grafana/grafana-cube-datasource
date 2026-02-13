// Mock @grafana/runtime BEFORE any imports
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: jest.fn(),
  DataSourceWithBackend: jest.fn().mockImplementation(() => ({})),
  getTemplateSrv: jest.fn(() => ({ replace: jest.fn((v: string) => v), getAdhocFilters: jest.fn(() => []) })),
}));

// Mock CodeEditor since it depends on Monaco web workers
jest.mock('@grafana/ui', () => ({
  ...jest.requireActual('@grafana/ui'),
  CodeEditor: ({ value }: { value: string }) => <pre data-testid="code-editor">{value}</pre>,
}));

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { setup } from 'testUtils';
import { DataModelConfigPage, extractDatasourceUid } from './DataModelConfigPage';
import { getBackendSrv } from '@grafana/runtime';

const mockGetBackendSrv = getBackendSrv as jest.Mock;

const mockDbSchema = {
  tablesSchema: {
    public: {
      raw_customers: [{ name: 'id', type: 'integer', attributes: [] }],
      raw_orders: [{ name: 'id', type: 'integer', attributes: [] }],
    },
  },
};

const mockModelFiles = {
  files: [
    { fileName: 'cubes/raw_customers.yml', content: 'cubes:\n  - name: raw_customers\n    sql_table: public.raw_customers' },
    { fileName: 'cubes/raw_orders.yml', content: 'cubes:\n  - name: raw_orders\n    sql_table: public.raw_orders' },
  ],
};

const mockPluginProps = {
  plugin: { meta: { id: 'grafana-cube-datasource' } },
  query: {},
} as any;

function setLocationPathname(pathname: string) {
  // jsdom supports window.history.pushState to change pathname
  window.history.pushState({}, '', pathname);
}

describe('extractDatasourceUid', () => {
  it('extracts UID from standard datasource edit path', () => {
    expect(extractDatasourceUid('/connections/datasources/edit/cube-datasource/')).toBe('cube-datasource');
  });

  it('extracts UID from path with trailing slash', () => {
    expect(extractDatasourceUid('/connections/datasources/edit/my-uid/')).toBe('my-uid');
  });

  it('extracts UID from path without trailing slash and with query params', () => {
    expect(extractDatasourceUid('/connections/datasources/edit/my-uid?page=data-model')).toBe('my-uid');
  });

  it('returns null for unrelated paths', () => {
    expect(extractDatasourceUid('/some/other/path')).toBeNull();
  });
});

describe('DataModelConfigPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLocationPathname('/connections/datasources/edit/cube-datasource/?page=data-model');
  });

  function mockApi({ dbSchema = mockDbSchema, modelFiles = { files: [] as any[] }, generateResponse = { files: [] } } = {}) {
    const mockGet = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/resources/db-schema')) {
        return Promise.resolve(dbSchema);
      }
      if (url.includes('/resources/model-files')) {
        return Promise.resolve(modelFiles);
      }
      return Promise.reject(new Error(`Unexpected GET: ${url}`));
    });

    const mockPost = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/resources/generate-schema')) {
        return Promise.resolve(generateResponse);
      }
      return Promise.reject(new Error(`Unexpected POST: ${url}`));
    });

    mockGetBackendSrv.mockReturnValue({ get: mockGet, post: mockPost });
    return { mockGet, mockPost };
  }

  it('renders the database tree after loading', async () => {
    mockApi();
    setup(<DataModelConfigPage {...mockPluginProps} />);

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });
    expect(screen.getByText('raw_customers')).toBeInTheDocument();
    expect(screen.getByText('raw_orders')).toBeInTheDocument();
  });

  it('Generate button is disabled when no tables are selected', async () => {
    mockApi();
    setup(<DataModelConfigPage {...mockPluginProps} />);

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /Generate Data Model/i });
    expect(button).toBeDisabled();
  });

  it('Generate button becomes enabled after selecting a table', async () => {
    mockApi();
    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));

    const button = screen.getByRole('button', { name: /Generate Data Model/i });
    expect(button).not.toBeDisabled();
  });

  it('calls generate-schema API with correct payload when Generate is clicked', async () => {
    const { mockPost } = mockApi({ modelFiles: mockModelFiles });
    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));
    await user.click(screen.getByRole('button', { name: /Generate Data Model/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/datasources/uid/cube-datasource/resources/generate-schema',
        expect.objectContaining({
          format: 'yaml',
          tables: [['public', 'raw_customers']],
          tablesSchema: mockDbSchema.tablesSchema,
        })
      );
    });
  });

  it('switches to Files tab and shows generated files after generation', async () => {
    mockApi({ modelFiles: mockModelFiles });
    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));
    await user.click(screen.getByRole('button', { name: /Generate Data Model/i }));

    // After generation, file list and file header both show the filename
    await waitFor(() => {
      const matches = screen.getAllByText('cubes/raw_customers.yml');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows YAML content in code editor when a file is selected', async () => {
    mockApi({ modelFiles: mockModelFiles });
    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    // Switch to files tab
    await user.click(screen.getByText('Files'));

    await waitFor(() => {
      expect(screen.getByText('cubes/raw_customers.yml')).toBeInTheDocument();
    });

    await user.click(screen.getByText('cubes/raw_customers.yml'));

    await waitFor(() => {
      const editor = screen.getByTestId('code-editor');
      expect(editor).toHaveTextContent('raw_customers');
    });
  });

  it('shows error alert when datasource UID cannot be extracted', () => {
    setLocationPathname('/some/other/path');

    setup(<DataModelConfigPage {...mockPluginProps} />);

    expect(screen.getByText('Unable to determine datasource')).toBeInTheDocument();
  });

  it('shows selected table count in Generate button text', async () => {
    mockApi();
    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));
    expect(screen.getByRole('button', { name: /Generate Data Model \(1\)/i })).toBeInTheDocument();

    await user.click(screen.getByText('raw_orders'));
    expect(screen.getByRole('button', { name: /Generate Data Model \(2\)/i })).toBeInTheDocument();
  });

  it('shows file header with filename when a file is selected', async () => {
    mockApi({ modelFiles: mockModelFiles });
    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    await user.click(screen.getByText('Files'));

    await waitFor(() => {
      expect(screen.getByText('cubes/raw_customers.yml')).toBeInTheDocument();
    });

    // Click a file in the sidebar
    await user.click(screen.getByText('cubes/raw_customers.yml'));

    // The filename should also appear in the file header bar
    const fileHeaders = screen.getAllByText('cubes/raw_customers.yml');
    expect(fileHeaders.length).toBeGreaterThanOrEqual(2); // sidebar + header
  });

  it('shows empty state with descriptive text when no file is selected', async () => {
    mockApi();
    setup(<DataModelConfigPage {...mockPluginProps} />);

    expect(screen.getByText('Generate Data Models')).toBeInTheDocument();
    expect(screen.getByText(/Select tables from the sidebar/)).toBeInTheDocument();
  });

  it('retains table selections when switching between tabs', async () => {
    mockApi({ modelFiles: mockModelFiles });
    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    // Select a table
    await user.click(screen.getByText('raw_customers'));
    expect(screen.getByRole('button', { name: /Generate Data Model \(1\)/i })).toBeInTheDocument();

    // Switch to Files tab
    await user.click(screen.getByText(/^Files/));

    // Switch back to Tables tab
    await user.click(screen.getByText(/^Tables/));

    // Selection should be retained
    expect(screen.getByRole('button', { name: /Generate Data Model \(1\)/i })).toBeInTheDocument();
  });

  it('updates code editor when switching between files', async () => {
    mockApi({ modelFiles: mockModelFiles });
    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    // Switch to files tab
    await user.click(screen.getByText(/^Files/));

    await waitFor(() => {
      expect(screen.getByText('cubes/raw_customers.yml')).toBeInTheDocument();
    });

    // Select first file
    await user.click(screen.getByText('cubes/raw_customers.yml'));
    expect(screen.getByTestId('code-editor')).toHaveTextContent('raw_customers');

    // Select second file
    await user.click(screen.getByText('cubes/raw_orders.yml'));
    expect(screen.getByTestId('code-editor')).toHaveTextContent('raw_orders');
  });

  it('shows generation error message when API fails', async () => {
    const mockGet = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/resources/db-schema')) {
        return Promise.resolve(mockDbSchema);
      }
      if (url.includes('/resources/model-files')) {
        return Promise.resolve({ files: [] });
      }
      return Promise.reject(new Error('Unexpected'));
    });

    // Use mockImplementation to avoid immediate rejection at mock creation
    const mockPost = jest.fn().mockImplementation(() => Promise.reject(new Error('Server error')));
    mockGetBackendSrv.mockReturnValue({ get: mockGet, post: mockPost });

    const { user } = setup(<DataModelConfigPage {...mockPluginProps} />);

    await waitFor(() => {
      expect(screen.getByText('raw_customers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('raw_customers'));
    await user.click(screen.getByRole('button', { name: /Generate Data Model/i }));

    await waitFor(() => {
      expect(screen.getByText('Generation failed')).toBeInTheDocument();
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});
