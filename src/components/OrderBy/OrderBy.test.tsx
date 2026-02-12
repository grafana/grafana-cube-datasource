import React from 'react';
import { screen } from '@testing-library/react';
import { setup } from 'testUtils';
import { OrderBy } from './OrderBy';
import { DEFAULT_ORDER } from 'types';

describe('OrderBy', () => {
  const mockOnAdd = jest.fn();
  const mockOnRemove = jest.fn();
  const mockOnToggleDirection = jest.fn();
  const mockOnReorder = jest.fn();

  const mockOptions = [
    { label: 'Status', value: 'orders.status' },
    { label: 'Customer', value: 'orders.customer' },
    { label: 'Count', value: 'orders.count' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the component', () => {
    setup(
      <OrderBy
        availableOptions={mockOptions}
        onAdd={mockOnAdd}
        onRemove={mockOnRemove}
        onToggleDirection={mockOnToggleDirection}
        onReorder={mockOnReorder}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Order By' })).toBeInTheDocument();
  });

  it('should render the options when clicked', async () => {
    const { user } = setup(
      <OrderBy
        availableOptions={mockOptions}
        onAdd={mockOnAdd}
        onRemove={mockOnRemove}
        onToggleDirection={mockOnToggleDirection}
        onReorder={mockOnReorder}
      />
    );

    const select = screen.getByRole('combobox', { name: 'Order By' });
    await user.click(select);

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
  });

  it('should add a new order field when the add button is clicked', async () => {
    const { user } = setup(
      <OrderBy
        availableOptions={mockOptions}
        onAdd={mockOnAdd}
        onRemove={mockOnRemove}
        onToggleDirection={mockOnToggleDirection}
        onReorder={mockOnReorder}
      />
    );

    const select = screen.getByRole('combobox', { name: 'Order By' });
    await user.click(select);
    await user.click(await screen.findByText('Status'));

    expect(mockOnAdd).toHaveBeenCalledWith('orders.status', DEFAULT_ORDER);
  });

  it('should remove an order field when the remove button is clicked', async () => {
    const { user } = setup(
      <OrderBy
        availableOptions={mockOptions}
        onAdd={mockOnAdd}
        onRemove={mockOnRemove}
        onToggleDirection={mockOnToggleDirection}
        onReorder={mockOnReorder}
        order={[['orders.status', 'desc']]}
      />
    );

    const removeButton = screen.getByRole('button', { name: 'Remove field from order by' });
    await user.click(removeButton);

    expect(mockOnRemove).toHaveBeenCalledWith('orders.status');
  });

  it('should toggle the direction when the direction button is clicked', async () => {
    const { user } = setup(
      <OrderBy
        availableOptions={mockOptions}
        onAdd={mockOnAdd}
        onRemove={mockOnRemove}
        onToggleDirection={mockOnToggleDirection}
        onReorder={mockOnReorder}
        order={[['orders.status', 'desc']]}
      />
    );

    const directionButton = screen.getByRole('button', { name: 'Change the sort direction' });
    await user.click(directionButton);

    expect(mockOnToggleDirection).toHaveBeenCalledWith('orders.status');
  });

  it('should handle legacy object format for backward compatibility', async () => {
    const { user } = setup(
      <OrderBy
        availableOptions={mockOptions}
        onAdd={mockOnAdd}
        onRemove={mockOnRemove}
        onToggleDirection={mockOnToggleDirection}
        onReorder={mockOnReorder}
        order={{ 'orders.status': 'desc' }}
      />
    );

    // Should render the order field from legacy format
    expect(screen.getByText('Status')).toBeInTheDocument();

    // Should still work with callbacks
    const removeButton = screen.getByRole('button', { name: 'Remove field from order by' });
    await user.click(removeButton);
    expect(mockOnRemove).toHaveBeenCalledWith('orders.status');
  });
});
