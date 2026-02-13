import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileList } from './FileList';
import { ModelFile } from '../types';

const mockFiles: ModelFile[] = [
  { fileName: 'cubes/raw_customers.yml', content: 'cubes:\n  - name: raw_customers' },
  { fileName: 'cubes/raw_orders.yml', content: 'cubes:\n  - name: raw_orders' },
  { fileName: 'views/example_view.yml', content: 'views:\n  - name: example' },
];

describe('FileList', () => {
  it('renders list of files with correct names', () => {
    render(<FileList files={mockFiles} onFileSelect={jest.fn()} />);

    expect(screen.getByText('cubes/raw_customers.yml')).toBeInTheDocument();
    expect(screen.getByText('cubes/raw_orders.yml')).toBeInTheDocument();
    expect(screen.getByText('views/example_view.yml')).toBeInTheDocument();
  });

  it('calls onFileSelect when a file is clicked', async () => {
    const onFileSelect = jest.fn();
    const user = userEvent.setup();

    render(<FileList files={mockFiles} onFileSelect={onFileSelect} />);

    await user.click(screen.getByText('cubes/raw_customers.yml'));
    expect(onFileSelect).toHaveBeenCalledWith(mockFiles[0]);
  });

  it('shows empty state when no files', () => {
    render(<FileList files={[]} onFileSelect={jest.fn()} />);

    expect(screen.getByText(/no files generated yet/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<FileList files={[]} onFileSelect={jest.fn()} isLoading={true} />);

    expect(screen.getByText(/loading files/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<FileList files={[]} onFileSelect={jest.fn()} error={new Error('Network error')} />);

    expect(screen.getByText(/failed to load model files/i)).toBeInTheDocument();
  });
});
