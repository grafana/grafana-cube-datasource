import React from 'react';
import { screen } from '@testing-library/react';
import { setup } from 'testUtils';
import { FileList } from './FileList';
import { ModelFile } from 'types';

describe('FileList', () => {
  it('renders files sorted by cubes, views, then others', () => {
    const files: ModelFile[] = [
      { fileName: 'misc/custom.yml', content: 'misc' },
      { fileName: 'views/example_view.yml', content: 'view' },
      { fileName: 'cubes/raw_orders.yml', content: 'cube' },
    ];

    const { container } = setup(<FileList files={files} />);
    const items = Array.from(container.querySelectorAll('[data-testid="file-item-name"]')).map((el) => el.textContent);

    expect(items).toEqual(['cubes/raw_orders.yml', 'views/example_view.yml', 'misc/custom.yml']);
  });

  it('calls onFileSelect with selected file payload', async () => {
    const files: ModelFile[] = [{ fileName: 'cubes/raw_orders.yml', content: 'cube-content' }];
    const onFileSelect = jest.fn();
    const { user } = setup(<FileList files={files} onFileSelect={onFileSelect} />);

    await user.click(screen.getByRole('button', { name: 'Open cubes/raw_orders.yml' }));

    expect(onFileSelect).toHaveBeenCalledWith('cubes/raw_orders.yml', 'cube-content');
  });

  it('shows empty state when there are no files', () => {
    setup(<FileList files={[]} />);
    expect(screen.getByText('No files generated yet')).toBeInTheDocument();
  });
});
