import React from 'react';
import { screen } from '@testing-library/react';
import { setup } from 'testUtils';
import { DataModelConfigPage } from './DataModelConfigPage';
import { getBackendSrv } from '@grafana/runtime';

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
});
