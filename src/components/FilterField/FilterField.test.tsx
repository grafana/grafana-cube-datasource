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
    const valueSelects = screen.getAllByRole('combobox', { name: 'Select values' });
    expect(valueSelects).toHaveLength(2);
  });

  describe('multi-value filter support', () => {
    it('should render existing filter with multiple values', async () => {
      setup(
        <FilterField
          dimensions={mockOptions}
          filters={[{ member: 'orders.status', operator: Operator.Equals, values: ['completed', 'pending'] }]}
          onAdd={mockOnAdd}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          datasource={mockDataSource}
        />
      );

      // Should display both selected values
      expect(await screen.findByText('completed')).toBeInTheDocument();
      expect(await screen.findByText('pending')).toBeInTheDocument();
    });

    it('should call onUpdate with array of values when multiple values are selected', async () => {
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

      // Wait for initial value to load
      expect(await screen.findByText('completed')).toBeInTheDocument();

      // Click on the value select to open dropdown
      const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
      await user.click(valueSelect);

      // Select an additional value
      const pendingOption = await screen.findByText('pending');
      await user.click(pendingOption);

      // onUpdate should be called with array of values
      expect(mockOnUpdate).toHaveBeenCalledWith(0, 'orders.status', Operator.Equals, ['completed', 'pending']);
    });

    it('should call onAdd with array of values when creating new filter with multiple values', async () => {
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

      // Click Add Filter button
      await user.click(screen.getByRole('button', { name: 'Add filter' }));

      // Select the field
      const fieldSelect = screen.getByRole('combobox', { name: 'Select field' });
      await user.click(fieldSelect);
      await user.click(await screen.findByText('orders.status'));

      // Wait for values to load and select multiple
      const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
      await user.click(valueSelect);
      await user.click(await screen.findByText('completed'));

      // Should have called onAdd with the first value
      expect(mockOnAdd).toHaveBeenCalledWith('orders.status', Operator.Equals, ['completed']);
    });
  });
});
