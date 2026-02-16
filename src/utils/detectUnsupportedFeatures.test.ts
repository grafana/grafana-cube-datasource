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

  it('detects filters on measures', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      filters: [{ member: 'orders.count', operator: Operator.Equals, values: ['10'] }],
    };
    const issues = detectUnsupportedFeatures(query);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/filters on measures/i);
  });

  it('returns no issues for dimension filters when measures are selected', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['active'] }],
    };
    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });

  it('returns no issues for filters when no measures are selected', () => {
    const query: CubeQuery = {
      ...baseQuery,
      dimensions: ['orders.status'],
      filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['active'] }],
    };
    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });
});
