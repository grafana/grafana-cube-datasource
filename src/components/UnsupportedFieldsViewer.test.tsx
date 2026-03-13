import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnsupportedFieldsViewer } from './UnsupportedFieldsViewer';
import { CubeQuery, Operator } from '../types';

describe('UnsupportedFieldsViewer', () => {
  const baseQuery: CubeQuery = { refId: 'A' };

  it('renders nothing when unsupported keys set is empty', () => {
    const { container } = render(
      <UnsupportedFieldsViewer query={baseQuery} unsupportedKeys={new Set()} reasons={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the "Additional query configuration" heading', () => {
    const query: CubeQuery = {
      ...baseQuery,
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
    };

    render(
      <UnsupportedFieldsViewer
        query={query}
        unsupportedKeys={new Set(['timeDimensions'])}
        reasons={['Time dimensions are not yet supported in the visual editor']}
      />
    );

    expect(screen.getByText('Additional query configuration')).toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it('displays reasons as a list', () => {
    const query: CubeQuery = {
      ...baseQuery,
      timeDimensions: [{ dimension: 'orders.created_at' }],
      filters: [{ member: 'orders.amount', operator: Operator.Gt, values: ['100'] }],
    };

    render(
      <UnsupportedFieldsViewer
        query={query}
        unsupportedKeys={new Set(['timeDimensions', 'filters'])}
        reasons={['Time dimensions not supported', 'Advanced filter operators: gt']}
      />
    );

    expect(screen.getByText('Time dimensions not supported')).toBeInTheDocument();
    expect(screen.getByText('Advanced filter operators: gt')).toBeInTheDocument();
  });

  it('shows only the unsupported keys in JSON, not the full query', () => {
    const query: CubeQuery = {
      refId: 'A',
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
    };

    render(
      <UnsupportedFieldsViewer
        query={query}
        unsupportedKeys={new Set(['timeDimensions'])}
        reasons={['Time dimensions']}
      />
    );

    // JSON is collapsed by default — expand it
    fireEvent.click(screen.getByTestId('unsupported-fields-toggle'));

    const jsonContent = screen.getByTestId('unsupported-fields-content');
    const parsed = JSON.parse(jsonContent.textContent || '');

    expect(parsed.timeDimensions).toEqual([{ dimension: 'orders.created_at', granularity: 'day' }]);
    // Supported fields should NOT appear in the JSON
    expect(parsed).not.toHaveProperty('dimensions');
    expect(parsed).not.toHaveProperty('measures');
    expect(parsed).not.toHaveProperty('refId');
  });

  it('JSON is collapsed by default and expandable', () => {
    const query: CubeQuery = {
      refId: 'A',
      timeDimensions: [{ dimension: 'orders.created_at' }],
    };

    render(
      <UnsupportedFieldsViewer
        query={query}
        unsupportedKeys={new Set(['timeDimensions'])}
        reasons={['Time dimensions']}
      />
    );

    // JSON should not be visible initially
    expect(screen.queryByTestId('unsupported-fields-content')).not.toBeInTheDocument();
    expect(screen.getByText(/show json/i)).toBeInTheDocument();

    // Click toggle to expand
    fireEvent.click(screen.getByTestId('unsupported-fields-toggle'));
    expect(screen.getByTestId('unsupported-fields-content')).toBeInTheDocument();
    expect(screen.getByText(/hide json/i)).toBeInTheDocument();
  });

  it('shows multiple unsupported keys when present', () => {
    const query: CubeQuery = {
      refId: 'A',
      dimensions: ['orders.status'],
      timeDimensions: [{ dimension: 'orders.created_at' }],
      filters: [
        {
          or: [
            { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
            { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
          ],
        },
      ],
    };

    render(
      <UnsupportedFieldsViewer
        query={query}
        unsupportedKeys={new Set(['timeDimensions', 'filters'])}
        reasons={['Time dimensions', 'AND/OR filter groups']}
      />
    );

    // Expand JSON
    fireEvent.click(screen.getByTestId('unsupported-fields-toggle'));

    const jsonContent = screen.getByTestId('unsupported-fields-content');
    const parsed = JSON.parse(jsonContent.textContent || '');

    expect(parsed).toHaveProperty('timeDimensions');
    expect(parsed).toHaveProperty('filters');
    expect(parsed).not.toHaveProperty('dimensions');
  });
});
