import { getTemplateSrv } from '@grafana/runtime';
import { normalizeCubeQuery } from './normalizeCubeQuery';
import { CubeQuery, Operator } from '../types';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getTemplateSrv: jest.fn(),
}));
const mockGetTemplateSrv = getTemplateSrv as jest.Mock;

const identityMapOperator = (op: string): Operator => (op === '!=' ? Operator.NotEquals : Operator.Equals);

const baseOptions = {
  datasourceName: 'Test Cube',
  mapOperator: identityMapOperator,
  scopedVars: {},
};

// Dashboard time range: 2023-12-01 .. 2023-12-02
const DASH_FROM = '1701388800000';
const DASH_TO = '1701475200000';
const DASH_FROM_ISO = '2023-12-01T00:00:00.000Z';
const DASH_TO_ISO = '2023-12-02T00:00:00.000Z';

const withDashboardTimeDimension = (dimension: string | null) =>
  mockGetTemplateSrv.mockReturnValue({
    getAdhocFilters: () => [],
    replace: (str: string) => {
      if (str === '$cubeTimeDimension') {
        return dimension ?? str; // null => variable not configured
      }
      if (str === '$__from') {
        return DASH_FROM;
      }
      if (str === '$__to') {
        return DASH_TO;
      }
      return str;
    },
  });

describe('normalizeCubeQuery timeDimensions intersection (issue #173)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('injects only the dashboard range when the panel has no timeDimensions', () => {
    withDashboardTimeDimension('orders.created_at');
    const query = { refId: 'A', measures: ['orders.count'] } as CubeQuery;

    const result = normalizeCubeQuery(query, baseOptions);

    expect(result.timeDimensions).toEqual([{ dimension: 'orders.created_at', dateRange: [DASH_FROM_ISO, DASH_TO_ISO] }]);
  });

  it('appends the dashboard range for a panel timeDimension on a DIFFERENT dimension', () => {
    withDashboardTimeDimension('orders.created_at');
    const query = {
      refId: 'A',
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.updated_at', granularity: 'day' }],
    } as unknown as CubeQuery;

    const result = normalizeCubeQuery(query, baseOptions);

    expect(result.timeDimensions).toEqual([
      { dimension: 'orders.updated_at', granularity: 'day' },
      { dimension: 'orders.created_at', dateRange: [DASH_FROM_ISO, DASH_TO_ISO] },
    ]);
  });

  it('appends the dashboard range for a panel timeDimension on the SAME dimension (intersection via AND)', () => {
    withDashboardTimeDimension('orders.created_at');
    const query = {
      refId: 'A',
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.created_at', dateRange: ['2018-01-01T00:00:00.000Z', '2018-12-31T00:00:00.000Z'] }],
    } as unknown as CubeQuery;

    const result = normalizeCubeQuery(query, baseOptions);

    // Both entries are sent; Cube ANDs the two dateRanges server-side.
    expect(result.timeDimensions).toEqual([
      { dimension: 'orders.created_at', dateRange: ['2018-01-01T00:00:00.000Z', '2018-12-31T00:00:00.000Z'] },
      { dimension: 'orders.created_at', dateRange: [DASH_FROM_ISO, DASH_TO_ISO] },
    ]);
  });

  it('keeps a SAME-dimension granularity-only panel entry AND appends the dashboard range (grouping kept + range applied)', () => {
    withDashboardTimeDimension('orders.created_at');
    const query = {
      refId: 'A',
      measures: ['orders.count'],
      // Same dimension as $cubeTimeDimension, but granularity-only (no dateRange):
      // this entry drives grouping and, per Cube, contributes no WHERE clause.
      timeDimensions: [{ dimension: 'orders.created_at', granularity: 'day' }],
    } as unknown as CubeQuery;

    const result = normalizeCubeQuery(query, baseOptions);

    // Panel's granularity-only entry is preserved (grouping) and the dashboard
    // dateRange entry is appended (supplies the WHERE range). Both are sent so
    // grouping is kept AND the dashboard range is applied.
    expect(result.timeDimensions).toEqual([
      { dimension: 'orders.created_at', granularity: 'day' },
      { dimension: 'orders.created_at', dateRange: [DASH_FROM_ISO, DASH_TO_ISO] },
    ]);
  });

  it('leaves the panel timeDimensions unchanged when $cubeTimeDimension is not configured', () => {
    withDashboardTimeDimension(null);
    const query = {
      refId: 'A',
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.created_at', dateRange: ['2018-01-01T00:00:00.000Z', '2018-12-31T00:00:00.000Z'] }],
    } as unknown as CubeQuery;

    const result = normalizeCubeQuery(query, baseOptions);

    expect(result.timeDimensions).toEqual([
      { dimension: 'orders.created_at', dateRange: ['2018-01-01T00:00:00.000Z', '2018-12-31T00:00:00.000Z'] },
    ]);
  });

  it('leaves the panel timeDimensions unchanged when the dashboard time range is unavailable', () => {
    // $cubeTimeDimension set, but $__from/$__to unavailable.
    mockGetTemplateSrv.mockReturnValue({
      getAdhocFilters: () => [],
      replace: (str: string) => (str === '$cubeTimeDimension' ? 'orders.created_at' : str),
    });
    const query = {
      refId: 'A',
      measures: ['orders.count'],
      timeDimensions: [{ dimension: 'orders.updated_at', granularity: 'day' }],
    } as unknown as CubeQuery;

    const result = normalizeCubeQuery(query, baseOptions);

    expect(result.timeDimensions).toEqual([{ dimension: 'orders.updated_at', granularity: 'day' }]);
  });

  it('returns undefined timeDimensions when panel has none and no dashboard dimension', () => {
    withDashboardTimeDimension(null);
    const query = { refId: 'A', measures: ['orders.count'] } as CubeQuery;

    const result = normalizeCubeQuery(query, baseOptions);

    expect(result.timeDimensions).toBeUndefined();
  });
});
