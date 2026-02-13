import React from 'react';
import { screen } from '@testing-library/react';
import { setup } from 'testUtils';
import { DatabaseTree } from './DatabaseTree';
import { useDbSchemaQuery } from 'queries';

jest.mock('queries', () => ({
  useDbSchemaQuery: jest.fn(),
}));

const mockedUseDbSchemaQuery = useDbSchemaQuery as jest.MockedFunction<typeof useDbSchemaQuery>;

const schemaResponse = {
  tablesSchema: {
    public: {
      raw_customers: [],
      raw_orders: [],
      raw_payments: [],
    },
  },
};

describe('DatabaseTree', () => {
  it('renders loading state', () => {
    mockedUseDbSchemaQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    setup(<DatabaseTree datasourceUid="cube-datasource" selectedTables={[]} onTableSelect={jest.fn()} />);

    expect(screen.getByText('Loading database schema...')).toBeInTheDocument();
  });

  it('renders schema and tables', () => {
    mockedUseDbSchemaQuery.mockReturnValue({
      data: schemaResponse,
      isLoading: false,
      error: null,
    } as any);

    setup(<DatabaseTree datasourceUid="cube-datasource" selectedTables={[]} onTableSelect={jest.fn()} />);

    expect(screen.getByText('public')).toBeInTheDocument();
    expect(screen.getByText('raw_customers')).toBeInTheDocument();
    expect(screen.getByText('raw_orders')).toBeInTheDocument();
    expect(screen.getByText('raw_payments')).toBeInTheDocument();
  });

  it('selects a table on click', async () => {
    const onTableSelect = jest.fn();
    mockedUseDbSchemaQuery.mockReturnValue({
      data: schemaResponse,
      isLoading: false,
      error: null,
    } as any);

    const { user } = setup(
      <DatabaseTree datasourceUid="cube-datasource" selectedTables={[]} onTableSelect={onTableSelect} />
    );

    await user.click(screen.getByText('raw_orders'));

    expect(onTableSelect).toHaveBeenCalledWith(['public\0raw_orders']);
  });

  it('shows error state', () => {
    mockedUseDbSchemaQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    } as any);

    setup(<DatabaseTree datasourceUid="cube-datasource" selectedTables={[]} onTableSelect={jest.fn()} />);

    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
