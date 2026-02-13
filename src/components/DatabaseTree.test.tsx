import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { setup } from 'testUtils';
import { useDbSchemaQuery } from 'queries';
import { DatabaseTree } from './DatabaseTree';

jest.mock('queries', () => ({
  useDbSchemaQuery: jest.fn(),
}));

const mockedUseDbSchemaQuery = useDbSchemaQuery as jest.Mock;

describe('DatabaseTree', () => {
  it('renders loading state while schema is loading', () => {
    mockedUseDbSchemaQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    setup(<DatabaseTree datasourceUid="cube-datasource" />);

    expect(screen.getByText('Loading database schema...')).toBeInTheDocument();
  });

  it('renders error state when schema request fails', () => {
    mockedUseDbSchemaQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    });

    setup(<DatabaseTree datasourceUid="cube-datasource" />);

    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders schemas and tables from db schema response', () => {
    mockedUseDbSchemaQuery.mockReturnValue({
      data: {
        tablesSchema: {
          public: {
            raw_customers: [],
            raw_orders: [],
          },
        },
      },
      isLoading: false,
      error: null,
    });

    setup(<DatabaseTree datasourceUid="cube-datasource" />);

    expect(screen.getByText('public')).toBeInTheDocument();
    expect(screen.getByText('raw_customers')).toBeInTheDocument();
    expect(screen.getByText('raw_orders')).toBeInTheDocument();
  });

  it('calls onTableSelect with added table when selecting a table checkbox', () => {
    mockedUseDbSchemaQuery.mockReturnValue({
      data: {
        tablesSchema: {
          public: {
            raw_orders: [],
          },
        },
      },
      isLoading: false,
      error: null,
    });
    const onTableSelect = jest.fn();

    setup(<DatabaseTree datasourceUid="cube-datasource" selectedTables={[]} onTableSelect={onTableSelect} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Table public.raw_orders' }));

    expect(onTableSelect).toHaveBeenCalledWith(['public.raw_orders']);
  });

  it('shows parent schema checkbox indeterminate for partial selection', () => {
    mockedUseDbSchemaQuery.mockReturnValue({
      data: {
        tablesSchema: {
          public: {
            raw_customers: [],
            raw_orders: [],
          },
        },
      },
      isLoading: false,
      error: null,
    });

    setup(<DatabaseTree datasourceUid="cube-datasource" selectedTables={['public.raw_customers']} />);

    const schemaCheckbox = screen.getByRole('checkbox', { name: 'Schema public' });
    expect(schemaCheckbox).toHaveAttribute('aria-checked', 'mixed');
  });
});
