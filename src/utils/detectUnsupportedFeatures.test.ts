import { CubeQuery, Operator } from '../types';
import { detectUnsupportedFeatures } from './detectUnsupportedFeatures';

const baseQuery: CubeQuery = { refId: 'A' };

describe('detectUnsupportedFeatures', () => {
  it('returns empty array for a simple query with dimensions and measures', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      measures: ['orders.count'],
    };
    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });

  it('returns empty array for an empty query', () => {
    expect(detectUnsupportedFeatures(baseQuery)).toEqual([]);
  });

  it('returns empty array when timeDimensions is an empty array', () => {
    const query: CubeQuery = { ...baseQuery, timeDimensions: [] };
    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });

  it('detects time dimensions', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/time dimensions/i);
  });

  it('returns no issues for a query with equals/notEquals filters', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      limit: 100,
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['active'] }],
      order: [['orders.count', 'desc']],
    };
    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });

  it('detects advanced filter operators', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      filters: [{ member: 'orders.amount', operator: Operator.Gt, values: ['100'] }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/gt/);
  });

  it('detects unary filter operators', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      filters: [{ member: 'orders.discount', operator: Operator.Set }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/set/);
  });

  it('lists each unique advanced operator only once', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        { member: 'orders.amount', operator: Operator.Gt, values: ['100'] },
        { member: 'orders.price', operator: Operator.Gt, values: ['50'] },
        { member: 'orders.name', operator: Operator.Contains, values: ['test'] },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/gt/);
    expect(issues[0]).toMatch(/contains/);
  });

  it('can report both time dimensions and advanced operators', () => {
    const query: CubeQuery = {
      ...baseQuery,
      timeDimensions: [{ dimension: 'orders.created_at' }],
      filters: [{ member: 'orders.amount', operator: Operator.Lt, values: ['50'] }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(2);
  });

  it('detects AND filter groups', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        {
          and: [
            { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
            { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
          ],
        },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/AND\/OR filter groups/i);
  });

  it('detects OR filter groups', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        {
          or: [
            { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
            { member: 'orders.region', operator: Operator.Equals, values: ['EU'] },
          ],
        },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/AND\/OR filter groups/i);
  });

  it('detects advanced operators inside nested groups', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        {
          or: [
            { member: 'orders.amount', operator: Operator.Gt, values: ['100'] },
            { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
          ],
        },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    // Should report both the logical group AND the advanced operator
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/AND\/OR filter groups/i);
    expect(issues[1]).toMatch(/gt/);
  });

  it('handles deeply nested AND/OR groups', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        {
          and: [
            {
              or: [
                { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
                { member: 'orders.status', operator: Operator.Equals, values: ['pending'] },
              ],
            },
            { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
          ],
        },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/AND\/OR filter groups/i);
  });

  it('detects template variables in filter values', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      filters: [
        { member: 'orders.customers_first_name', operator: Operator.Equals, values: ['$customerName'] },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/dashboard variables/i);
  });

  it('detects template variables in filter values with ${} syntax', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        { member: 'orders.status', operator: Operator.Equals, values: ['${statusVar}'] },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/dashboard variables/i);
  });

  it('does not flag filter values without template variables', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      filters: [
        { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
      ],
    };
    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });

  it('does not flag dollar signs in non-variable contexts (e.g. currency)', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        { member: 'orders.amount', operator: Operator.Equals, values: ['$100'] },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(0);
  });

  it('does not flag trailing dollar sign', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        { member: 'orders.label', operator: Operator.Equals, values: ['test$'] },
      ],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(0);
  });
});
