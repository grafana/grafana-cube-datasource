import { CubeQuery, Operator } from '../types';
import { detectUnsupportedFeatures, getUnsupportedQueryKeys, extractUnsupportedFilters, extractVisualBuilderFilters } from './detectUnsupportedFeatures';

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

  it('detects template variables in filter values with $var syntax', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['$statusVar'] }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/dashboard variables/i);
  });

  it('detects template variables in filter values with ${var} syntax', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['${statusVar}'] }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/dashboard variables/i);
  });

  it('detects template variables in filter values with [[var]] syntax', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['[[statusVar]]'] }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/dashboard variables/i);
  });

  it('detects template variables in filter values with ${var:format} syntax', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['${status:csv}'] }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/dashboard variables/i);
  });

  it('detects template variables with various format specifiers', () => {
    const formats = ['csv', 'json', 'pipe', 'raw', 'regex', 'glob', 'queryparam'];
    for (const format of formats) {
      const query: CubeQuery = {
        ...baseQuery,
        filters: [{ member: 'orders.status', operator: Operator.Equals, values: [`\${myVar:${format}}`] }],
      };
      const issues = detectUnsupportedFeatures(query);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatch(/dashboard variables/i);
    }
  });

  it('does not flag dollar signs in non-variable contexts', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        { member: 'orders.amount', operator: Operator.Equals, values: ['$100'] },
        { member: 'orders.label', operator: Operator.Equals, values: ['test$'] },
      ],
    };
    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });
});

describe('getUnsupportedQueryKeys', () => {
  it('returns empty set for a simple query', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      measures: ['orders.count'],
    };
    expect(getUnsupportedQueryKeys(query).size).toBe(0);
  });

  it('returns "timeDimensions" when time dimensions are present', () => {
    const query: CubeQuery = {
      ...baseQuery,
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
    };
    const keys = getUnsupportedQueryKeys(query);
    expect(keys.has('timeDimensions')).toBe(true);
    expect(keys.size).toBe(1);
  });

  it('returns "filters" when AND/OR groups are present', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [
        {
          or: [
            { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
            { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
          ],
        },
      ],
    };
    const keys = getUnsupportedQueryKeys(query);
    expect(keys.has('filters')).toBe(true);
    expect(keys.size).toBe(1);
  });

  it('returns "filters" when advanced operators are present', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [{ member: 'orders.amount', operator: Operator.Gt, values: ['100'] }],
    };
    const keys = getUnsupportedQueryKeys(query);
    expect(keys.has('filters')).toBe(true);
  });

  it('returns both keys when time dimensions and filter issues coexist', () => {
    const query: CubeQuery = {
      ...baseQuery,
      timeDimensions: [{ dimension: 'orders.created_at' }],
      filters: [{ member: 'orders.amount', operator: Operator.Lt, values: ['50'] }],
    };
    const keys = getUnsupportedQueryKeys(query);
    expect(keys.has('timeDimensions')).toBe(true);
    expect(keys.has('filters')).toBe(true);
    expect(keys.size).toBe(2);
  });

  it('does not include "filters" for simple equals/notEquals filters', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['active'] }],
    };
    expect(getUnsupportedQueryKeys(query).size).toBe(0);
  });

  it('includes "filters" when filter values contain template variables', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['[[statusVar]]'] }],
    };
    const keys = getUnsupportedQueryKeys(query);
    expect(keys.has('filters')).toBe(true);
    expect(keys.size).toBe(1);
  });

  it('includes "filters" when filter values contain ${var:format} template variables', () => {
    const query: CubeQuery = {
      ...baseQuery,
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['${status:csv}'] }],
    };
    const keys = getUnsupportedQueryKeys(query);
    expect(keys.has('filters')).toBe(true);
    expect(keys.size).toBe(1);
  });
});

describe('extractUnsupportedFilters', () => {
  it('returns empty array for undefined filters', () => {
    expect(extractUnsupportedFilters(undefined)).toEqual([]);
  });

  it('returns empty array for empty filters', () => {
    expect(extractUnsupportedFilters([])).toEqual([]);
  });

  it('returns empty array when all filters are visual-builder-compatible', () => {
    const filters = [
      { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
      { member: 'orders.region', operator: Operator.NotEquals, values: ['EU'] },
    ];
    expect(extractUnsupportedFilters(filters)).toEqual([]);
  });

  it('extracts AND filter groups', () => {
    const andGroup = {
      and: [
        { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
        { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
      ],
    };
    const filters = [
      { member: 'orders.customer', operator: Operator.Equals, values: ['test'] },
      andGroup,
    ];
    expect(extractUnsupportedFilters(filters)).toEqual([andGroup]);
  });

  it('extracts OR filter groups', () => {
    const orGroup = {
      or: [
        { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
        { member: 'orders.status', operator: Operator.Equals, values: ['pending'] },
      ],
    };
    const filters = [orGroup];
    expect(extractUnsupportedFilters(filters)).toEqual([orGroup]);
  });

  it('extracts filters with advanced operators', () => {
    const advancedFilter = { member: 'orders.amount', operator: Operator.Gt, values: ['100'] };
    const filters = [
      { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
      advancedFilter,
    ];
    expect(extractUnsupportedFilters(filters)).toEqual([advancedFilter]);
  });

  it('extracts filters with template variables', () => {
    const templateFilter = { member: 'orders.status', operator: Operator.Equals, values: ['$statusVar'] };
    const filters = [
      { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
      templateFilter,
    ];
    expect(extractUnsupportedFilters(filters)).toEqual([templateFilter]);
  });

  it('extracts filters with ${var:format} template variables', () => {
    const templateFilter = { member: 'orders.status', operator: Operator.Equals, values: ['${status:csv}'] };
    const filters = [
      { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
      templateFilter,
    ];
    expect(extractUnsupportedFilters(filters)).toEqual([templateFilter]);
  });

  it('extracts multiple unsupported filters', () => {
    const andGroup = { and: [{ member: 'a', operator: Operator.Equals, values: ['x'] }] };
    const advancedFilter = { member: 'b', operator: Operator.Gt, values: ['100'] };
    const filters = [
      { member: 'c', operator: Operator.Equals, values: ['y'] },
      andGroup,
      advancedFilter,
    ];
    expect(extractUnsupportedFilters(filters)).toEqual([andGroup, advancedFilter]);
  });
});

describe('extractVisualBuilderFilters', () => {
  it('returns empty array for undefined filters', () => {
    expect(extractVisualBuilderFilters(undefined)).toEqual([]);
  });

  it('returns empty array for empty filters', () => {
    expect(extractVisualBuilderFilters([])).toEqual([]);
  });

  it('returns equals/notEquals filters without template variables', () => {
    const filters = [
      { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
      { member: 'orders.region', operator: Operator.NotEquals, values: ['EU'] },
    ];
    expect(extractVisualBuilderFilters(filters)).toEqual(filters);
  });

  it('excludes AND/OR filter groups', () => {
    const filters = [
      { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
      { and: [{ member: 'a', operator: Operator.Equals, values: ['x'] }] },
    ];
    expect(extractVisualBuilderFilters(filters)).toEqual([
      { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
    ]);
  });

  it('excludes filters with advanced operators', () => {
    const filters = [
      { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
      { member: 'orders.amount', operator: Operator.Gt, values: ['100'] },
    ];
    expect(extractVisualBuilderFilters(filters)).toEqual([
      { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
    ]);
  });

  it('excludes filters with template variables', () => {
    const filters = [
      { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
      { member: 'orders.status', operator: Operator.Equals, values: ['$statusVar'] },
    ];
    expect(extractVisualBuilderFilters(filters)).toEqual([
      { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
    ]);
  });

  it('excludes filters with ${var:format} template variables', () => {
    const filters = [
      { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
      { member: 'orders.status', operator: Operator.Equals, values: ['${status:csv}'] },
    ];
    expect(extractVisualBuilderFilters(filters)).toEqual([
      { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
    ]);
  });

  it('returns empty array when all filters are unsupported', () => {
    const filters = [
      { and: [{ member: 'a', operator: Operator.Equals, values: ['x'] }] },
      { member: 'b', operator: Operator.Gt, values: ['100'] },
    ];
    expect(extractVisualBuilderFilters(filters)).toEqual([]);
  });
});
