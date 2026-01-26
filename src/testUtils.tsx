import { DataSourceInstanceSettings } from '@grafana/data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { select } from 'react-select-event';
import { CubeDataSourceOptions } from 'types';
import { DataSource } from 'datasource';

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
    jsonData: { cubeApiUrl: 'http://localhost:4000' },
    readOnly: false,
    access: 'proxy',
  };

  const datasource = new DataSource(instanceSettings);

  // Mock getMetadata
  datasource.getMetadata = jest.fn().mockResolvedValue(
    mockMetadata || {
      dimensions: [
        { label: 'orders.status', value: 'orders.status' },
        { label: 'orders.customer', value: 'orders.customer' },
      ],
      measures: [
        { label: 'orders.count', value: 'orders.count' },
        { label: 'orders.total', value: 'orders.total' },
      ],
    }
  );

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

export const selectOptionInTest = async (
  input: HTMLElement,
  optionOrOptions: string | RegExp | Array<string | RegExp>
) => await waitFor(() => select(input, optionOrOptions, { container: document.body }));
