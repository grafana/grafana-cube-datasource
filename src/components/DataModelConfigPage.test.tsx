import React from 'react';
import { screen } from '@testing-library/react';
import { setup } from 'testUtils';
import { DataModelConfigPage } from './DataModelConfigPage';
import { useDbSchemaQuery, useGenerateSchemaMutation, useModelFilesQuery } from 'queries';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    CodeEditor: ({ value }: { value: string }) => <div data-testid="mock-code-editor">{value}</div>,
  };
});

jest.mock('queries', () => ({
  useDbSchemaQuery: jest.fn(),
  useGenerateSchemaMutation: jest.fn(),
  useModelFilesQuery: jest.fn(),
}));

jest.mock('./DatabaseTree', () => ({
  DatabaseTree: ({ onTableSelect }: { onTableSelect: (tables: string[]) => void }) => (
    <div>
      <button type="button" onClick={() => onTableSelect(['public\0raw_orders'])}>
        Select raw_orders
      </button>
    </div>
  ),
}));

const mockedUseDbSchemaQuery = useDbSchemaQuery as jest.MockedFunction<typeof useDbSchemaQuery>;
const mockedUseGenerateSchemaMutation = useGenerateSchemaMutation as jest.MockedFunction<typeof useGenerateSchemaMutation>;
const mockedUseModelFilesQuery = useModelFilesQuery as jest.MockedFunction<typeof useModelFilesQuery>;

describe('DataModelConfigPage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/connections/datasources/edit/cube-datasource/?page=data-model');
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
    } as any);
    mockedUseGenerateSchemaMutation.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({ files: [] }),
      isPending: false,
      isError: false,
      error: null,
    } as any);
    mockedUseModelFilesQuery.mockReturnValue({
      data: { files: [] },
      refetch: jest.fn().mockResolvedValue({
        data: {
          files: [{ fileName: 'cubes/raw_orders.yml', content: 'orders schema' }],
        },
      }),
    } as any);
  });

  it('keeps generate button disabled when no tables are selected', () => {
    setup(<DataModelConfigPage plugin={{ meta: { id: 'grafana-cube-datasource' } } as any} query={{}} />);

    expect(screen.getByRole('button', { name: 'Generate Data Model' })).toBeDisabled();
    expect(screen.getByText('Select a file to preview generated YAML.')).toBeInTheDocument();
  });

  it('enables generate button once a table is selected', async () => {
    const { user } = setup(<DataModelConfigPage plugin={{ meta: { id: 'grafana-cube-datasource' } } as any} query={{}} />);

    await user.click(screen.getByRole('button', { name: 'Select raw_orders' }));

    expect(screen.getByRole('button', { name: 'Generate Data Model' })).toBeEnabled();
  });

  it('calls generate mutation with expected payload', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ files: [] });
    mockedUseGenerateSchemaMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
    } as any);

    const { user } = setup(<DataModelConfigPage plugin={{ meta: { id: 'grafana-cube-datasource' } } as any} query={{}} />);

    await user.click(screen.getByRole('button', { name: 'Select raw_orders' }));
    await user.click(screen.getByRole('button', { name: 'Generate Data Model' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      format: 'yaml',
      tables: [['public', 'raw_orders']],
      tablesSchema: {
        public: {
          raw_orders: [],
        },
      },
    });
  });

  it('switches to files tab and shows first generated file content', async () => {
    const { user } = setup(<DataModelConfigPage plugin={{ meta: { id: 'grafana-cube-datasource' } } as any} query={{}} />);

    await user.click(screen.getByRole('button', { name: 'Select raw_orders' }));
    await user.click(screen.getByRole('button', { name: 'Generate Data Model' }));

    expect(screen.getByRole('button', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByTestId('yaml-preview')).toHaveAttribute('data-content', 'orders schema');
  });

  it('shows error alert when generation fails', async () => {
    mockedUseGenerateSchemaMutation.mockReturnValue({
      mutateAsync: jest.fn().mockRejectedValue(new Error('generation exploded')),
      isPending: false,
      isError: false,
      error: null,
    } as any);

    const { user } = setup(<DataModelConfigPage plugin={{ meta: { id: 'grafana-cube-datasource' } } as any} query={{}} />);
    await user.click(screen.getByRole('button', { name: 'Select raw_orders' }));
    await user.click(screen.getByRole('button', { name: 'Generate Data Model' }));

    expect(screen.getByText('generation exploded')).toBeInTheDocument();
  });

  it('shows route error when datasource uid is missing', () => {
    window.history.pushState({}, '', '/connections/datasources/new');
    setup(<DataModelConfigPage plugin={{ meta: { id: 'grafana-cube-datasource' } } as any} query={{}} />);

    expect(screen.getByText('This page requires a datasource edit route.')).toBeInTheDocument();
  });
});
