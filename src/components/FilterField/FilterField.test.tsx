import React from 'react';
import { screen } from '@testing-library/react';
import { createMockDataSource, setup } from 'testUtils';
import { FilterField } from './FilterField';
import { Operator } from 'types';

describe('FilterField', () => {
  const mockOnChange = jest.fn();

  const mockDataSource = createMockDataSource();
  const mockOptions = [
    { label: 'orders.status', value: 'orders.status' },
    { label: 'orders.customer', value: 'orders.customer' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render filter inputs with existing filter', async () => {
    setup(
      <FilterField
        dimensions={mockOptions}
        filters={[{ member: 'orders.status', operator: Operator.Equals, values: ['completed'] }]}
        onChange={mockOnChange}
        datasource={mockDataSource}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Select field' })).toBeInTheDocument();
    expect(screen.getByText('orders.status')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select operator' })).toBeInTheDocument();
    expect(screen.getByText('=')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select values' })).toBeInTheDocument();
    expect(await screen.findByText('completed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter' })).toBeInTheDocument();
  });

  it('should allow adding a new filter row', async () => {
    const { user } = setup(
      <FilterField
        dimensions={mockOptions}
        filters={[]}
        onChange={mockOnChange}
        datasource={mockDataSource}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add filter' }));

    expect(screen.getByRole('combobox', { name: 'Select field' })).toBeInTheDocument();
  });

  it('should call onChange when a filter is removed', async () => {
    const { user } = setup(
      <FilterField
        dimensions={mockOptions}
        filters={[{ member: 'orders.status', operator: Operator.Equals, values: ['completed'] }]}
        onChange={mockOnChange}
        datasource={mockDataSource}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove filter' }));

    expect(mockOnChange).toHaveBeenCalledWith([]);
  });

  it('should call onChange with updated values when selecting a value', async () => {
    const { user } = setup(
      <FilterField
        dimensions={mockOptions}
        filters={[{ member: 'orders.status', operator: Operator.Equals, values: ['completed'] }]}
        onChange={mockOnChange}
        datasource={mockDataSource}
      />
    );

    await screen.findByText('completed');
    const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
    await user.click(valueSelect);
    await user.click(await screen.findByText('pending'));

    expect(mockOnChange).toHaveBeenLastCalledWith([
      { member: 'orders.status', operator: Operator.Equals, values: ['completed', 'pending'] },
    ]);
  });

  it('should call onChange when removing a value', async () => {
    const { user } = setup(
      <FilterField
        dimensions={mockOptions}
        filters={[{ member: 'orders.status', operator: Operator.Equals, values: ['completed', 'pending'] }]}
        onChange={mockOnChange}
        datasource={mockDataSource}
      />
    );

    await screen.findByText('completed');
    await screen.findByText('pending');

    const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
    await user.click(valueSelect);
    await user.keyboard('{Backspace}');

    expect(mockOnChange).toHaveBeenLastCalledWith([
      { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
    ]);
  });

  it('should call onChange when selecting a field for a new filter', async () => {
    const { user } = setup(
      <FilterField
        dimensions={mockOptions}
        filters={[]}
        onChange={mockOnChange}
        datasource={mockDataSource}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await user.click(screen.getByRole('combobox', { name: 'Select field' }));
    await user.click(await screen.findByText('orders.status'));

    expect(mockOnChange).toHaveBeenLastCalledWith([
      { member: 'orders.status', operator: Operator.Equals, values: [] },
    ]);
  });
});
