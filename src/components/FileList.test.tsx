import React from 'react';
import { screen } from '@testing-library/react';
import { setup } from 'testUtils';
import { FileList } from './FileList';
import { ModelFile } from 'types';

const files: ModelFile[] = [
  { fileName: 'views/example_view.yml', content: 'view content' },
  { fileName: 'cubes/raw_orders.yml', content: 'orders content' },
  { fileName: 'cubes/raw_customers.yml', content: 'customers content' },
];

describe('FileList', () => {
  it('renders files sorted by cubes then views', () => {
    setup(<FileList files={files} selectedFile={undefined} onFileSelect={jest.fn()} />);

    const items = screen.getAllByRole('button');
    expect(items[0]).toHaveTextContent('cubes/raw_customers.yml');
    expect(items[1]).toHaveTextContent('cubes/raw_orders.yml');
    expect(items[2]).toHaveTextContent('views/example_view.yml');
  });

  it('calls onFileSelect on click', async () => {
    const onFileSelect = jest.fn();
    const { user } = setup(<FileList files={files} selectedFile={undefined} onFileSelect={onFileSelect} />);

    await user.click(screen.getByRole('button', { name: /cubes\/raw_orders.yml/i }));

    expect(onFileSelect).toHaveBeenCalledWith('cubes/raw_orders.yml', 'orders content');
  });

  it('shows empty state when there are no files', () => {
    setup(<FileList files={[]} selectedFile={undefined} onFileSelect={jest.fn()} />);

    expect(screen.getByText('No files generated yet')).toBeInTheDocument();
  });
});
