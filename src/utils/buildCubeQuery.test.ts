import { getTemplateSrv } from '@grafana/runtime';
import { buildCubeQueryJson } from './buildCubeQuery';
import { CubeQuery, Operator } from '../types';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getTemplateSrv: jest.fn(),
}));

const mockGetTemplateSrv = getTemplateSrv as jest.Mock;

const createDatasourceStub = () => {
  return {
    name: 'Test Cube',
    mapOperator: jest.fn((operator: string) => {
      if (operator === '!=') {
        return Operator.NotEquals;
      }
      return Operator.Equals;
    }),
    // No cached view metadata in these tests -> AdHoc view-scoping is a no-op (#307).
    getCachedMetadata: jest.fn(() => null),
  } as any;
};

describe('buildCubeQueryJson', () => {
  beforeEach(() => {
    mockGetTemplateSrv.mockReturnValue({
      replace: (value: string) => value,
      getAdhocFilters: () => [],
    });
  });

  it('includes limit when limit is 0', () => {
    const datasource = createDatasourceStub();
    const query: CubeQuery = {
      refId: 'A',
      measures: ['orders.count'],
      limit: 0,
    };

    const result = JSON.parse(buildCubeQueryJson(query, datasource).json);

    expect(result.limit).toBe(0);
  });

  it('omits limit when limit is undefined', () => {
    const datasource = createDatasourceStub();
    const query: CubeQuery = {
      refId: 'A',
      measures: ['orders.count'],
    };

    const result = JSON.parse(buildCubeQueryJson(query, datasource).json);

    expect(result).not.toHaveProperty('limit');
  });

  it('serializes unary filters without values', () => {
    const datasource = createDatasourceStub();
    const query: CubeQuery = {
      refId: 'A',
      measures: ['orders.count'],
      filters: [{ member: 'orders.discount', operator: Operator.Set }],
    };

    const result = JSON.parse(buildCubeQueryJson(query, datasource).json);

    expect(result.filters).toEqual([{ member: 'orders.discount', operator: 'set' }]);
  });

  it('serializes logical groups recursively', () => {
    const datasource = createDatasourceStub();
    const query: CubeQuery = {
      refId: 'A',
      measures: ['orders.count'],
      filters: [
        {
          or: [
            { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
            {
              and: [
                { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
                { member: 'orders.amount', operator: Operator.Gt, values: ['100'] },
              ],
            },
          ],
        },
      ],
    };

    const result = JSON.parse(buildCubeQueryJson(query, datasource).json);

    expect(result.filters).toEqual([
      {
        or: [
          { member: 'orders.status', operator: 'equals', values: ['active'] },
          {
            and: [
              { member: 'orders.region', operator: 'equals', values: ['US'] },
              { member: 'orders.amount', operator: 'gt', values: ['100'] },
            ],
          },
        ],
      },
    ]);
  });

  it('omits injected dashboard time dimension when $__from/$__to are invalid', () => {
    mockGetTemplateSrv.mockReturnValue({
      replace: (value: string) => {
        if (value === '$cubeTimeDimension') {
          return 'orders.created_at';
        }
        if (value === '$__from') {
          return 'invalid';
        }
        if (value === '$__to') {
          return '1701475200000';
        }
        return value;
      },
      getAdhocFilters: () => [],
    });

    const datasource = createDatasourceStub();
    const query: CubeQuery = {
      refId: 'A',
      measures: ['orders.count'],
    };

    const result = JSON.parse(buildCubeQueryJson(query, datasource).json);

    expect(result).not.toHaveProperty('timeDimensions');
  });

  it('surfaces AdHoc filters dropped as inapplicable to the query view (issue #307)', () => {
    mockGetTemplateSrv.mockReturnValue({
      replace: (value: string) => value,
      getAdhocFilters: () => [
        { key: 'view_a.region', operator: '=', value: 'uk' },
        { key: 'view_b.region', operator: '=', value: 'fr' },
      ],
    });

    const datasource = createDatasourceStub();
    datasource.getCachedMetadata = jest.fn(() => ({
      dimensions: [
        { label: 'view_a.region', value: 'view_a.region', type: 'string', cube: 'view_a' },
        { label: 'view_b.region', value: 'view_b.region', type: 'string', cube: 'view_b' },
      ],
      measures: [{ label: 'view_a.count', value: 'view_a.count', type: 'number', cube: 'view_a' }],
    }));

    const query: CubeQuery = { refId: 'A', measures: ['view_a.count'] };

    const { json, droppedAdHocFilters } = buildCubeQueryJson(query, datasource);
    const parsed = JSON.parse(json);

    // Only the same-view filter is applied...
    expect(parsed.filters).toEqual([{ member: 'view_a.region', operator: 'equals', values: ['uk'] }]);
    // ...and the cross-view filter is reported as dropped.
    expect(droppedAdHocFilters).toEqual([{ member: 'view_b.region', operator: 'equals', values: ['fr'] }]);
  });
});
