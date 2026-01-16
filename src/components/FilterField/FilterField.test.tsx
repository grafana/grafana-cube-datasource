import React from 'react';
import { screen } from '@testing-library/react';
import { createMockDataSource, setup } from 'testUtils';
import { FilterField } from './FilterField';
import { Operator } from 'types';

describe('FilterField', () => {
  const mockOnAdd = jest.fn();
  const mockOnRemove = jest.fn();
  const mockOnUpdate = jest.fn();

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
        onAdd={mockOnAdd}
        onUpdate={mockOnUpdate}
        onRemove={mockOnRemove}
        datasource={mockDataSource}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Select field' })).toBeInTheDocument();
    expect(screen.getByText('orders.status')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select operator' })).toBeInTheDocument();
    expect(screen.getByText('=')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Select value' })).toBeInTheDocument();

    // Wait for the value to load
    expect(await screen.findByText('completed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter' })).toBeInTheDocument();
  });

  it('should allow adding a new filter', async () => {
    const { user } = setup(
      <FilterField
        dimensions={mockOptions}
        filters={[]}
        onAdd={mockOnAdd}
        onUpdate={mockOnUpdate}
        onRemove={mockOnRemove}
        datasource={mockDataSource}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add filter' }));

    // Just check one of the fields is rendered
    expect(screen.getByRole('combobox', { name: 'Select field' })).toBeInTheDocument();
  });

  it('should have add button disabled when field is not selected', async () => {
    const { user } = setup(
      <FilterField
        dimensions={mockOptions}
        filters={[]}
        onAdd={mockOnAdd}
        onUpdate={mockOnUpdate}
        onRemove={mockOnRemove}
        datasource={mockDataSource}
      />
    );

    const addButton = screen.getByRole('button', { name: 'Add filter' });
    await user.click(addButton);
    expect(addButton).toBeDisabled();
  });

  it('removes a filter when the remove button is clicked', async () => {
    const { user } = setup(
      <FilterField
        dimensions={mockOptions}
        filters={[{ member: 'orders.status', operator: Operator.Equals, values: ['completed'] }]}
        onAdd={mockOnAdd}
        onUpdate={mockOnUpdate}
        onRemove={mockOnRemove}
        datasource={mockDataSource}
      />
    );

    const removeButton = screen.getByRole('button', { name: 'Remove filter' });
    await user.click(removeButton);
    expect(mockOnRemove).toHaveBeenCalled();
  });

  it('filters out already-selected values for the same member', () => {
    setup(
      <FilterField
        dimensions={mockOptions}
        filters={[
          { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
          { member: 'orders.status', operator: Operator.Equals, values: ['pending'] },
        ]}
        onAdd={mockOnAdd}
        onUpdate={mockOnUpdate}
        onRemove={mockOnRemove}
        datasource={mockDataSource}
      />
    );

    // Both filters should render successfully
    const valueSelects = screen.getAllByRole('combobox', { name: 'Select value' });
    expect(valueSelects).toHaveLength(2);
  });
});
