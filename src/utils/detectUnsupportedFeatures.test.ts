import { CubeQuery, Operator } from '../types';
import { detectUnsupportedFeatures } from './detectUnsupportedFeatures';

const createQuery = (overrides: Partial<CubeQuery> = {}): CubeQuery => ({
  refId: 'A',
  ...overrides,
});

describe('detectUnsupportedFeatures', () => {
  describe('supported queries (visual builder can handle)', () => {
    it('returns empty array for empty query', () => {
      const query = createQuery();
      expect(detectUnsupportedFeatures(query)).toEqual([]);
    });

    it('returns empty array for query with simple dimensions and measures', () => {
      const query = createQuery({
        dimensions: ['orders.status', 'orders.customer'],
        measures: ['orders.count', 'orders.total'],
      });
      expect(detectUnsupportedFeatures(query)).toEqual([]);
    });

    it('returns empty array for query with simple filters', () => {
      const query = createQuery({
        dimensions: ['orders.status'],
        filters: [
          { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
          { member: 'orders.customer', operator: Operator.NotEquals, values: ['test'] },
        ],
      });
      expect(detectUnsupportedFeatures(query)).toEqual([]);
    });

    it('returns empty array for query with order and limit', () => {
      const query = createQuery({
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        order: [['orders.count', 'desc']],
        limit: 100,
      });
      expect(detectUnsupportedFeatures(query)).toEqual([]);
    });
  });

  describe('time dimensions (unsupported)', () => {
    it('detects time dimensions', () => {
      const query = createQuery({
        dimensions: ['orders.status'],
        timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
      });

      const result = detectUnsupportedFeatures(query);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Time dimensions');
      expect(result[0].detail).toBe('orders.created_at');
    });

    it('detects multiple time dimensions', () => {
      const query = createQuery({
        timeDimensions: [
          { dimension: 'orders.created_at', granularity: 'day' },
          { dimension: 'orders.updated_at', granularity: 'hour' },
        ],
      });

      const result = detectUnsupportedFeatures(query);
      expect(result).toHaveLength(1);
      expect(result[0].detail).toBe('orders.created_at, orders.updated_at');
    });

    it('ignores empty timeDimensions array', () => {
      const query = createQuery({
        dimensions: ['orders.status'],
        timeDimensions: [],
      });
      expect(detectUnsupportedFeatures(query)).toEqual([]);
    });
  });

  describe('dashboard variables (unsupported)', () => {
    it('detects dashboard variable in dimensions', () => {
      const query = createQuery({
        dimensions: ['$selectedDimension'],
      });

      const result = detectUnsupportedFeatures(query);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Dashboard variable in dimensions');
      expect(result[0].detail).toBe('$selectedDimension');
    });

    it('detects dashboard variable with braces in dimensions', () => {
      const query = createQuery({
        dimensions: ['${selectedDimension}'],
      });

      const result = detectUnsupportedFeatures(query);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Dashboard variable in dimensions');
    });

    it('detects dashboard variable in measures', () => {
      const query = createQuery({
        measures: ['$selectedMeasure'],
      });

      const result = detectUnsupportedFeatures(query);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Dashboard variable in measures');
      expect(result[0].detail).toBe('$selectedMeasure');
    });

    it('detects multiple dashboard variables', () => {
      const query = createQuery({
        dimensions: ['$dim1', '$dim2'],
        measures: ['$measure1'],
      });

      const result = detectUnsupportedFeatures(query);
      expect(result).toHaveLength(3);
    });
  });

  describe('complex filter groups (unsupported)', () => {
    it('detects AND filter groups', () => {
      const query = createQuery({
        dimensions: ['orders.status'],
        filters: [
          {
            and: [
              { member: 'orders.status', operator: 'equals', values: ['completed'] },
              { member: 'orders.total', operator: 'gt', values: ['100'] },
            ],
          } as any,
        ],
      });

      const result = detectUnsupportedFeatures(query);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Complex filter groups (AND/OR logic)');
      expect(result[0].detail).toBe('AND group');
    });

    it('detects OR filter groups', () => {
      const query = createQuery({
        dimensions: ['orders.status'],
        filters: [
          {
            or: [
              { member: 'orders.status', operator: 'equals', values: ['completed'] },
              { member: 'orders.status', operator: 'equals', values: ['pending'] },
            ],
          } as any,
        ],
      });

      const result = detectUnsupportedFeatures(query);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Complex filter groups (AND/OR logic)');
      expect(result[0].detail).toBe('OR group');
    });

    it('reports complex filters only once even with multiple groups', () => {
      const query = createQuery({
        dimensions: ['orders.status'],
        filters: [
          { and: [{ member: 'orders.status', operator: 'equals', values: ['a'] }] } as any,
          { or: [{ member: 'orders.status', operator: 'equals', values: ['b'] }] } as any,
        ],
      });

      const result = detectUnsupportedFeatures(query);
      const complexFilterFeatures = result.filter((f) => f.description.includes('Complex filter'));
      expect(complexFilterFeatures).toHaveLength(1);
    });
  });

  describe('multiple unsupported features', () => {
    it('detects all unsupported features in a query', () => {
      const query = createQuery({
        dimensions: ['$selectedDimension'],
        measures: ['$selectedMeasure'],
        timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
        filters: [
          {
            or: [{ member: 'orders.status', operator: 'equals', values: ['a'] }],
          } as any,
        ],
      });

      const result = detectUnsupportedFeatures(query);
      // 1 time dimension + 1 dimension variable + 1 measure variable + 1 complex filter = 4
      expect(result).toHaveLength(4);

      const descriptions = result.map((f) => f.description);
      expect(descriptions).toContain('Time dimensions');
      expect(descriptions).toContain('Dashboard variable in dimensions');
      expect(descriptions).toContain('Dashboard variable in measures');
      expect(descriptions).toContain('Complex filter groups (AND/OR logic)');
    });
  });
});
