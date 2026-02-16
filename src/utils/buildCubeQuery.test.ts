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

    const result = JSON.parse(buildCubeQueryJson(query, datasource));

    expect(result.limit).toBe(0);
  });

  it('omits limit when limit is undefined', () => {
    const datasource = createDatasourceStub();
    const query: CubeQuery = {
      refId: 'A',
      measures: ['orders.count'],
    };

    const result = JSON.parse(buildCubeQueryJson(query, datasource));

    expect(result).not.toHaveProperty('limit');
  });

  it('serializes unary filters without values', () => {
    const datasource = createDatasourceStub();
    const query: CubeQuery = {
      refId: 'A',
      measures: ['orders.count'],
      filters: [{ member: 'orders.discount', operator: Operator.Set }],
    };

    const result = JSON.parse(buildCubeQueryJson(query, datasource));

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

    const result = JSON.parse(buildCubeQueryJson(query, datasource));

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
});
