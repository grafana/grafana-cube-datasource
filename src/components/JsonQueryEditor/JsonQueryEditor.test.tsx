import React from 'react';
import { screen } from '@testing-library/react';
import { JsonQueryEditor } from './JsonQueryEditor';
import { CubeQuery } from '../../types';
import { UnsupportedFeature } from '../../utils/detectUnsupportedFeatures';
import { setup } from '../../testUtils';

// Mock the CodeEditor since it uses Monaco which is complex to set up in tests
jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    CodeEditor: ({ value, readOnly }: { value: string; readOnly: boolean }) => (
      <pre data-testid="code-editor" data-readonly={readOnly}>
        {value}
      </pre>
    ),
  };
});

const createQuery = (overrides: Partial<CubeQuery> = {}): CubeQuery => ({
  refId: 'A',
  ...overrides,
});

describe('JsonQueryEditor', () => {
  it('renders info alert with title', () => {
    const query = createQuery({ dimensions: ['orders.status'] });
    const unsupportedFeatures: UnsupportedFeature[] = [{ description: 'Time dimensions', detail: 'orders.created_at' }];

    setup(<JsonQueryEditor query={query} unsupportedFeatures={unsupportedFeatures} />);

    expect(screen.getByText('Advanced query features detected')).toBeInTheDocument();
  });

  it('displays unsupported feature descriptions', () => {
    const query = createQuery({ dimensions: ['orders.status'] });
    const unsupportedFeatures: UnsupportedFeature[] = [
      { description: 'Time dimensions', detail: 'orders.created_at' },
      { description: 'Dashboard variable in dimensions', detail: '$selectedDimension' },
    ];

    setup(<JsonQueryEditor query={query} unsupportedFeatures={unsupportedFeatures} />);

    expect(screen.getByText('Time dimensions: orders.created_at')).toBeInTheDocument();
    expect(screen.getByText('Dashboard variable in dimensions: $selectedDimension')).toBeInTheDocument();
  });

  it('displays help text about editing via dashboard JSON', () => {
    const query = createQuery({ dimensions: ['orders.status'] });
    const unsupportedFeatures: UnsupportedFeature[] = [{ description: 'Time dimensions' }];

    setup(<JsonQueryEditor query={query} unsupportedFeatures={unsupportedFeatures} />);

    expect(screen.getByText(/edit the dashboard JSON directly/i)).toBeInTheDocument();
    expect(screen.getByText(/LLM/i)).toBeInTheDocument();
  });

  it('renders query JSON in code editor', () => {
    const query = createQuery({
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
    });
    const unsupportedFeatures: UnsupportedFeature[] = [{ description: 'Time dimensions' }];

    setup(<JsonQueryEditor query={query} unsupportedFeatures={unsupportedFeatures} />);

    const codeEditor = screen.getByTestId('code-editor');
    expect(codeEditor).toBeInTheDocument();

    // Verify JSON content contains the query fields
    const jsonContent = codeEditor.textContent || '';
    expect(jsonContent).toContain('"dimensions"');
    expect(jsonContent).toContain('"orders.status"');
    expect(jsonContent).toContain('"measures"');
    expect(jsonContent).toContain('"orders.count"');
    expect(jsonContent).toContain('"timeDimensions"');
  });

  it('renders code editor as read-only', () => {
    const query = createQuery({ dimensions: ['orders.status'] });
    const unsupportedFeatures: UnsupportedFeature[] = [{ description: 'Time dimensions' }];

    setup(<JsonQueryEditor query={query} unsupportedFeatures={unsupportedFeatures} />);

    const codeEditor = screen.getByTestId('code-editor');
    expect(codeEditor).toHaveAttribute('data-readonly', 'true');
  });

  it('excludes Grafana-internal fields from JSON display', () => {
    const query = createQuery({
      dimensions: ['orders.status'],
    });
    // Add Grafana internal fields that shouldn't appear in the JSON
    (query as any).datasource = { uid: 'some-uid', type: 'cube' };
    (query as any).hide = false;
    (query as any).key = 'query-key';

    const unsupportedFeatures: UnsupportedFeature[] = [{ description: 'Time dimensions' }];

    setup(<JsonQueryEditor query={query} unsupportedFeatures={unsupportedFeatures} />);

    const codeEditor = screen.getByTestId('code-editor');
    const jsonContent = codeEditor.textContent || '';

    // Should contain query fields
    expect(jsonContent).toContain('"dimensions"');

    // Should NOT contain Grafana internal fields
    expect(jsonContent).not.toContain('"refId"');
    expect(jsonContent).not.toContain('"datasource"');
    expect(jsonContent).not.toContain('"hide"');
    expect(jsonContent).not.toContain('"key"');
  });

  it('handles features without detail gracefully', () => {
    const query = createQuery({ dimensions: ['orders.status'] });
    const unsupportedFeatures: UnsupportedFeature[] = [
      { description: 'Complex filter groups (AND/OR logic)' }, // No detail
    ];

    setup(<JsonQueryEditor query={query} unsupportedFeatures={unsupportedFeatures} />);

    // Should display just the description without a colon
    expect(screen.getByText('Complex filter groups (AND/OR logic)')).toBeInTheDocument();
  });
});
