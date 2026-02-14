import { CubeQuery } from '../types';
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

  it('returns issues for a query with filters, order, limit, and no unsupported features', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      limit: 100,
      filters: [{ member: 'orders.status', operator: 'equals' as any, values: ['active'] }],
      order: [['orders.count', 'desc']],
    };
    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });
});
