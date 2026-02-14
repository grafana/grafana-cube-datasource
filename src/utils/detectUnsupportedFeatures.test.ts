import { detectUnsupportedFeatures } from './detectUnsupportedFeatures';
import { CubeQuery } from '../types';

describe('detectUnsupportedFeatures', () => {
  it('returns time dimension reason when query has timeDimensions', () => {
    const query: CubeQuery = {
      refId: 'A',
      dimensions: ['orders.status'],
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
    };

    expect(detectUnsupportedFeatures(query)).toEqual(['Time dimensions are not supported in the visual query builder.']);
  });

  it('returns empty array when query has no unsupported features', () => {
    const query: CubeQuery = {
      refId: 'A',
      dimensions: ['orders.status'],
      measures: ['orders.count'],
    };

    expect(detectUnsupportedFeatures(query)).toEqual([]);
  });
});
