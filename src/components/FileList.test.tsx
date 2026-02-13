jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: jest.fn(),
  DataSourceWithBackend: jest.fn().mockImplementation(() => ({})),
  getTemplateSrv: jest.fn(() => ({ replace: jest.fn((v: string) => v), getAdhocFilters: jest.fn(() => []) })),
}));

import React from 'react';
import { screen } from '@testing-library/react';
import { setup } from 'testUtils';
import { FileList } from './FileList';
import { ModelFile } from '../types';

const mockFiles: ModelFile[] = [
  { fileName: 'cubes/raw_customers.yml', content: 'cubes:\n  - name: raw_customers' },
  { fileName: 'cubes/raw_orders.yml', content: 'cubes:\n  - name: raw_orders' },
  { fileName: 'views/example_view.yml', content: 'views:\n  - name: example' },
];

describe('FileList', () => {
  it('renders list of files with correct names', () => {
    setup(
      <FileList files={mockFiles} isLoading={false} error={null} onFileSelect={jest.fn()} />
    );

    expect(screen.getByText('cubes/raw_customers.yml')).toBeInTheDocument();
    expect(screen.getByText('cubes/raw_orders.yml')).toBeInTheDocument();
    expect(screen.getByText('views/example_view.yml')).toBeInTheDocument();
  });

  it('sorts files: cubes first, then views', () => {
    const unorderedFiles: ModelFile[] = [
      { fileName: 'views/example_view.yml', content: 'view content' },
      { fileName: 'cubes/raw_orders.yml', content: 'cube content' },
      { fileName: 'cubes/raw_customers.yml', content: 'cube content' },
    ];

    setup(
      <FileList files={unorderedFiles} isLoading={false} error={null} onFileSelect={jest.fn()} />
    );

    const items = screen.getAllByText(/\.yml$/);
    expect(items[0]).toHaveTextContent('cubes/raw_customers.yml');
    expect(items[1]).toHaveTextContent('cubes/raw_orders.yml');
    expect(items[2]).toHaveTextContent('views/example_view.yml');
  });

  it('calls onFileSelect when a file is clicked', async () => {
    const onFileSelect = jest.fn();
    const { user } = setup(
      <FileList files={mockFiles} isLoading={false} error={null} onFileSelect={onFileSelect} />
    );

    await user.click(screen.getByText('cubes/raw_customers.yml'));

    expect(onFileSelect).toHaveBeenCalledWith(mockFiles[0]);
  });

  it('shows empty state when no files', () => {
    setup(
      <FileList files={[]} isLoading={false} error={null} onFileSelect={jest.fn()} />
    );

    expect(screen.getByText('No files generated yet')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    setup(
      <FileList files={[]} isLoading={true} error={null} onFileSelect={jest.fn()} />
    );

    expect(screen.getByText('Loading files...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    setup(
      <FileList files={[]} isLoading={false} error={new Error('Failed to load')} onFileSelect={jest.fn()} />
    );

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });
});
