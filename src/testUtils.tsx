import { DataSourceInstanceSettings } from '@grafana/data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { CubeDataSourceOptions } from './types';
import { DataSource } from './datasource';

export function setup(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const user = userEvent.setup();

  const { rerender, ...result } = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

  return {
    ...result,
    user,
    rerender: (rerenderUi: React.ReactElement) =>
      rerender(<QueryClientProvider client={client}>{rerenderUi}</QueryClientProvider>),
  };
}

export const createMockDataSource = (mockMetadata: any = null, mockSQLResponse: any = null) => {
  const instanceSettings: DataSourceInstanceSettings<CubeDataSourceOptions> = {
    id: 1,
    uid: 'test-uid',
    type: 'cube-datasource',
    name: 'Test Cube',
    meta: {} as any,
    jsonData: {},
    readOnly: false,
    access: 'proxy',
  };

  const datasource = new DataSource(instanceSettings);

  // Mock getMetadata. Members carry `cube` (their Cube view) so AdHoc view-scoping
  // (issue #307) can infer this single "orders" view and keep orders.* filters.
  const metadata = mockMetadata || {
    dimensions: [
      { label: 'orders.status', value: 'orders.status', type: 'string', cube: 'orders' },
      { label: 'orders.customer', value: 'orders.customer', type: 'string', cube: 'orders' },
      { label: 'orders.region', value: 'orders.region', type: 'string', cube: 'orders' },
    ],
    measures: [
      { label: 'orders.count', value: 'orders.count', type: 'number', cube: 'orders' },
      { label: 'orders.total', value: 'orders.total', type: 'number', cube: 'orders' },
    ],
  };
  datasource.getMetadata = jest.fn().mockResolvedValue(metadata);
  // Synchronous cache accessor used by the runtime path / buildCubeQueryJson fallback.
  datasource.getCachedMetadata = jest.fn().mockReturnValue(metadata);

  // Mock getResource for SQL compilation
  datasource.getResource = jest.fn().mockResolvedValue(
    mockSQLResponse || {
      sql: 'SELECT status, customer, COUNT(*) FROM orders GROUP BY status, customer',
    }
  );

  // Mock getTagValues for filter value loading
  datasource.getTagValues = jest.fn().mockResolvedValue([
    { text: 'completed', value: 'completed' },
    { text: 'pending', value: 'pending' },
    { text: 'cancelled', value: 'cancelled' },
  ]);

  return datasource;
};
