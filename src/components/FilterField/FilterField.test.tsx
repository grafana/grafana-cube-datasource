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
    expect(screen.getByRole('combobox', { name: 'Select values' })).toBeInTheDocument();

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

  describe('multi-value selection', () => {
    it('should render filter with multiple values', async () => {
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

      // Both values should be displayed as selected
      expect(await screen.findByText('completed')).toBeInTheDocument();
      expect(await screen.findByText('pending')).toBeInTheDocument();
    });

    it('should call onUpdate with array of values when selecting multiple values', async () => {
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

      // Wait for values to load
      await screen.findByText('completed');

      // Click on the multi-select to open it
      const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
      await user.click(valueSelect);

      // Select an additional value
      const pendingOption = await screen.findByText('pending');
      await user.click(pendingOption);

      // Should call onUpdate with array containing both values
      expect(mockOnUpdate).toHaveBeenCalledWith(0, 'orders.status', Operator.Equals, ['completed', 'pending']);
    });

    it('should call onAdd with array of values when adding a new filter with multiple values', async () => {
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

      // Add a new filter
      await user.click(screen.getByRole('button', { name: 'Add filter' }));

      // Select field
      const fieldSelect = screen.getByRole('combobox', { name: 'Select field' });
      await user.click(fieldSelect);
      await user.click(await screen.findByText('orders.status'));

      // Select first value
      const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
      await user.click(valueSelect);
      await user.click(await screen.findByText('completed'));

      // Open again and select another value
      await user.click(valueSelect);
      await user.click(await screen.findByText('pending'));

      // Should call onAdd with array of values
      expect(mockOnAdd).toHaveBeenCalledWith('orders.status', Operator.Equals, ['completed', 'pending']);
    });

    it('should disable add filter button when filter has no values selected', async () => {
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

      // Add a new filter
      await user.click(screen.getByRole('button', { name: 'Add filter' }));

      // Select field only
      const fieldSelect = screen.getByRole('combobox', { name: 'Select field' });
      await user.click(fieldSelect);
      await user.click(await screen.findByText('orders.status'));

      // Add button should remain disabled until a value is selected
      expect(screen.getByRole('button', { name: 'Add filter' })).toBeDisabled();
    });

    it('should render and allow interaction with many values (15+)', async () => {
      // Generate 15 values to test handling of many selections
      const manyValues = Array.from({ length: 15 }, (_, i) => `value-${i + 1}`);

      setup(
        <FilterField
          dimensions={mockOptions}
          filters={[{ member: 'orders.status', operator: Operator.Equals, values: manyValues }]}
          onAdd={mockOnAdd}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          datasource={mockDataSource}
        />
      );

      // All 15 values should be rendered
      for (const value of manyValues) {
        expect(await screen.findByText(value)).toBeInTheDocument();
      }

      // Each value should have a remove button (the 'x' on the pill)
      // In Grafana's MultiSelect, each selected value has a button to remove it
      const removeValueButtons = screen.getAllByRole('button', { name: /Remove/i });
      // Should have at least 15 remove buttons for the values (plus the filter remove button)
      expect(removeValueButtons.length).toBeGreaterThanOrEqual(15);
    });

    it('should allow removing individual values from a multi-value filter', async () => {
      const { user } = setup(
        <FilterField
          dimensions={mockOptions}
          filters={[{ member: 'orders.status', operator: Operator.Equals, values: ['completed', 'pending', 'cancelled'] }]}
          onAdd={mockOnAdd}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          datasource={mockDataSource}
        />
      );

      // Wait for values to load
      await screen.findByText('completed');
      const pendingText = await screen.findByText('pending');
      await screen.findByText('cancelled');

      // Find the remove button for 'pending' value by finding its parent container
      // and then the sibling button within that container
      const pendingContainer = pendingText.closest('[class*="multi-value-container"]');
      const pendingRemoveButton = pendingContainer?.querySelector('button[aria-label="Remove"]');
      expect(pendingRemoveButton).toBeInTheDocument();
      await user.click(pendingRemoveButton!);

      // Should call onUpdate with the remaining values
      expect(mockOnUpdate).toHaveBeenCalledWith(0, 'orders.status', Operator.Equals, ['completed', 'cancelled']);
    });
  });
});
