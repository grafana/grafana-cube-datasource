import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { JsonQueryViewer } from './JsonQueryViewer';
import { CubeQuery, Operator } from '../types';

describe('JsonQueryViewer', () => {
  const baseQuery: CubeQuery = { refId: 'A' };

  it('renders an info alert with the provided reasons', () => {
    const reasons = ['Time dimensions are not yet supported in the visual editor'];
    render(<JsonQueryViewer query={baseQuery} reasons={reasons} />);

    expect(screen.getByText(/features not supported by the visual editor/i)).toBeInTheDocument();
    expect(screen.getByText(reasons[0])).toBeInTheDocument();
  });

  it('renders multiple reasons as a list', () => {
    const reasons = ['Reason one', 'Reason two'];
    render(<JsonQueryViewer query={baseQuery} reasons={reasons} />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Reason one');
    expect(items[1]).toHaveTextContent('Reason two');
  });

  it('shows the query JSON with Cube-relevant fields only', () => {
    const query: CubeQuery = {
      refId: 'A',
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
    };

    render(<JsonQueryViewer query={query} reasons={['Time dimensions']} />);

    const jsonContent = screen.getByTestId('json-query-content');
    const parsed = JSON.parse(jsonContent.textContent || '');

    expect(parsed.dimensions).toEqual(['orders.status']);
    expect(parsed.measures).toEqual(['orders.count']);
    expect(parsed.timeDimensions).toEqual([{ dimension: 'orders.created_at', granularity: 'day' }]);
    // Grafana-internal fields should be excluded
    expect(parsed).not.toHaveProperty('refId');
  });

  it('omits empty fields from the displayed JSON', () => {
    const query: CubeQuery = {
      refId: 'A',
      dimensions: ['orders.status'],
      timeDimensions: [{ dimension: 'orders.created_at' }],
    };

    render(<JsonQueryViewer query={query} reasons={['Time dimensions']} />);

    const jsonContent = screen.getByTestId('json-query-content');
    const parsed = JSON.parse(jsonContent.textContent || '');

    expect(parsed).not.toHaveProperty('measures');
    expect(parsed).not.toHaveProperty('filters');
    expect(parsed).not.toHaveProperty('order');
    expect(parsed).not.toHaveProperty('limit');
  });

  it('includes filters, order, and limit when present', () => {
    const query: CubeQuery = {
      refId: 'A',
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.created_at' }],
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['active'] }],
      order: [['orders.count', 'desc']],
      limit: 50,
    };

    render(<JsonQueryViewer query={query} reasons={['Time dimensions']} />);

    const jsonContent = screen.getByTestId('json-query-content');
    const parsed = JSON.parse(jsonContent.textContent || '');

    expect(parsed.filters).toHaveLength(1);
    expect(parsed.order).toEqual([['orders.count', 'desc']]);
    expect(parsed.limit).toBe(50);
  });

  it('shows a hint about editing via dashboard JSON', () => {
    render(<JsonQueryViewer query={baseQuery} reasons={['Time dimensions']} />);
    expect(screen.getByText(/dashboard JSON editor/i)).toBeInTheDocument();
  });

  it('includes limit when set to zero', () => {
    const query: CubeQuery = {
      refId: 'A',
      dimensions: ['orders.status'],
      limit: 0,
    };

    render(<JsonQueryViewer query={query} reasons={['Time dimensions']} />);

    const jsonContent = screen.getByTestId('json-query-content');
    const parsed = JSON.parse(jsonContent.textContent || '');

    expect(parsed.limit).toBe(0);
  });
});
