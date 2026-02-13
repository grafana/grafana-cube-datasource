import React from 'react';
import { screen } from '@testing-library/react';
import { setup } from 'testUtils';
import { DataModelConfigPage } from './DataModelConfigPage';
import { getBackendSrv } from '@grafana/runtime';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    CodeEditor: ({ value }: { value: string }) => <div data-testid="yaml-preview">{value}</div>,
  };
});

jest.mock('@grafana/runtime', () => {
  const actual = jest.requireActual('@grafana/runtime');
  return {
    ...actual,
    getBackendSrv: jest.fn(),
  };
});

jest.mock('./DatabaseTree', () => ({
  DatabaseTree: ({ onTableSelect }: { onTableSelect?: (tables: string[]) => void }) => (
    <div>
      <button onClick={() => onTableSelect?.(['public.raw_orders'])}>select-table</button>
    </div>
  ),
}));

const mockedGetBackendSrv = getBackendSrv as jest.Mock;

const pluginProps = {
  plugin: {
    meta: {
      id: 'grafana-cube-datasource',
    },
  },
  query: {},
} as any;

describe('DataModelConfigPage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/connections/datasources/edit/cube-datasource/?page=data-model');
  });

  it('keeps Generate button disabled while no tables are selected', () => {
    setup(<DataModelConfigPage {...pluginProps} />);

    expect(screen.getByRole('button', { name: 'Generate Data Model' })).toBeDisabled();
  });

  it('enables Generate button after table selection and sends expected payload', async () => {
    const get = jest.fn().mockResolvedValue({
      tablesSchema: {
        public: {
          raw_orders: [],
        },
      },
    });
    const post = jest.fn().mockResolvedValue({ files: [] });
    mockedGetBackendSrv.mockReturnValue({ get, post });

    const { user } = setup(<DataModelConfigPage {...pluginProps} />);

    await user.click(screen.getByRole('button', { name: 'select-table' }));

    const generateButton = screen.getByRole('button', { name: 'Generate Data Model' });
    expect(generateButton).toBeEnabled();

    await user.click(generateButton);

    expect(get).toHaveBeenCalledWith('/api/datasources/uid/cube-datasource/resources/db-schema');
    expect(post).toHaveBeenCalledWith('/api/datasources/uid/cube-datasource/resources/generate-schema', {
      format: 'yaml',
      tables: [['public', 'raw_orders']],
      tablesSchema: {
        public: {
          raw_orders: [],
        },
      },
    });
  });

  it('shows YAML preview content when selecting a generated file', async () => {
    const get = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/resources/model-files')) {
        return Promise.resolve({
          files: [{ fileName: 'cubes/raw_orders.yml', content: 'cubes:\n  - name: raw_orders' }],
        });
      }

      if (url.includes('/resources/db-schema')) {
        return Promise.resolve({
          tablesSchema: {
            public: {
              raw_orders: [],
            },
          },
        });
      }

      return Promise.resolve({});
    });
    const post = jest.fn().mockResolvedValue({ files: [] });
    mockedGetBackendSrv.mockReturnValue({ get, post });

    const { user } = setup(<DataModelConfigPage {...pluginProps} />);

    await user.click(screen.getByRole('button', { name: 'Files' }));
    await user.click(screen.getByRole('button', { name: 'Open cubes/raw_orders.yml' }));

    expect(screen.getByTestId('yaml-preview')).toHaveTextContent('cubes:');
    expect(screen.getByTestId('yaml-preview')).toHaveTextContent('raw_orders');
  });

  it('shows model files error message when files request fails', async () => {
    const get = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/resources/model-files')) {
        return Promise.reject(new Error('model files unavailable'));
      }

      if (url.includes('/resources/db-schema')) {
        return Promise.resolve({
          tablesSchema: {
            public: {
              raw_orders: [],
            },
          },
        });
      }

      return Promise.resolve({});
    });
    const post = jest.fn().mockResolvedValue({ files: [] });
    mockedGetBackendSrv.mockReturnValue({ get, post });

    const { user } = setup(<DataModelConfigPage {...pluginProps} />);

    await user.click(screen.getByRole('button', { name: 'Files' }));

    expect(await screen.findByText('Failed to load model files')).toBeInTheDocument();
  });

  it('shows datasource UID error when URL does not contain datasource id', () => {
    mockedGetBackendSrv.mockReturnValue({ get: jest.fn(), post: jest.fn() });
    window.history.pushState({}, '', '/connections/datasources/edit/');

    setup(<DataModelConfigPage {...pluginProps} />);

    expect(screen.getByText('Could not determine datasource UID from URL.')).toBeInTheDocument();
  });
});
