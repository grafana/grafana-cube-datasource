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

  it('should disable add filter button when a previous filter has no field selected', async () => {
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

  it('should disable add filter button when a previous filter has no values selected', async () => {
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

    it('should allow removing individual values from a multi-value filter', async () => {
      const { user } = setup(
        <FilterField
          dimensions={mockOptions}
          filters={[{ member: 'orders.status', operator: Operator.Equals, values: ['completed', 'pending'] }]}
          onAdd={mockOnAdd}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
          datasource={mockDataSource}
        />
      );

      // Wait for values to load/render
      await screen.findByText('completed');
      await screen.findByText('pending');

      // Avoid relying on react-select internal DOM/class names.
      // Use keyboard behavior: backspace removes the last selected value.
      const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
      await user.click(valueSelect);
      await user.keyboard('{Backspace}');

      // Should call onUpdate with the remaining values (last value removed)
      expect(mockOnUpdate).toHaveBeenCalledWith(0, 'orders.status', Operator.Equals, ['completed']);
    });

    it('should call onUpdate with empty array when all values are removed from an existing filter', async () => {
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

      // Wait for value to render
      await screen.findByText('completed');

      // Clear the value using backspace
      const valueSelect = screen.getByRole('combobox', { name: 'Select values' });
      await user.click(valueSelect);
      await user.keyboard('{Backspace}');

      // Should call onUpdate with empty array so parent state is synchronized
      expect(mockOnUpdate).toHaveBeenCalledWith(0, 'orders.status', Operator.Equals, []);
    });
  });
});
