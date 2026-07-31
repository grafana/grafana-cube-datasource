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

describe('normalizeCubeQuery AdHoc view-scoping (issue #307)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Metadata with two sealed views, each fully-qualifying its own members.
  const metadata = {
    dimensions: [
      { label: 'view_a.region', value: 'view_a.region', type: 'string', cube: 'view_a' },
      { label: 'view_a.customer', value: 'view_a.customer', type: 'string', cube: 'view_a' },
      { label: 'view_b.region', value: 'view_b.region', type: 'string', cube: 'view_b' },
    ],
    measures: [
      { label: 'view_a.count', value: 'view_a.count', type: 'number', cube: 'view_a' },
      { label: 'view_b.count', value: 'view_b.count', type: 'number', cube: 'view_b' },
    ],
  };

  const withAdHocFilters = (filters: Array<{ key: string; operator: string; value: string; values?: string[] }>) =>
    mockGetTemplateSrv.mockReturnValue({
      getAdhocFilters: () => filters,
      // No $cubeTimeDimension / range unless a test overrides it.
      replace: (str: string) => str,
    });

  const options = { ...baseOptions, metadata };

  it('keeps an AdHoc filter whose member belongs to the query view', () => {
    withAdHocFilters([{ key: 'view_a.region', operator: '=', value: 'uk' }]);
    const query = { refId: 'A', dimensions: ['view_a.customer'], measures: ['view_a.count'] } as CubeQuery;

    const result = normalizeCubeQuery(query, options);

    expect(result.filters).toEqual([{ member: 'view_a.region', operator: Operator.Equals, values: ['uk'] }]);
    expect(result.droppedAdHocFilters).toBeUndefined();
  });

  it('drops an AdHoc filter whose member belongs to a different view', () => {
    withAdHocFilters([{ key: 'view_b.region', operator: '=', value: 'uk' }]);
    const query = { refId: 'A', dimensions: ['view_a.customer'], measures: ['view_a.count'] } as CubeQuery;

    const result = normalizeCubeQuery(query, options);

    expect(result.filters).toBeUndefined();
    expect(result.droppedAdHocFilters).toEqual([{ member: 'view_b.region', operator: Operator.Equals, values: ['uk'] }]);
  });

  it('keeps matching and drops non-matching filters together (mixed multi-view)', () => {
    withAdHocFilters([
      { key: 'view_a.region', operator: '=', value: 'uk' },
      { key: 'view_b.region', operator: '=', value: 'fr' },
    ]);
    const query = { refId: 'A', measures: ['view_a.count'] } as CubeQuery;

    const result = normalizeCubeQuery(query, options);

    expect(result.filters).toEqual([{ member: 'view_a.region', operator: Operator.Equals, values: ['uk'] }]);
    expect(result.droppedAdHocFilters).toEqual([{ member: 'view_b.region', operator: Operator.Equals, values: ['fr'] }]);
  });

  it('infers the query view from panel filters when no dims/measures are set', () => {
    withAdHocFilters([{ key: 'view_a.region', operator: '=', value: 'uk' }]);
    const query = {
      refId: 'A',
      filters: [{ member: 'view_a.customer', operator: Operator.Equals, values: ['BBC'] }],
    } as unknown as CubeQuery;

    const result = normalizeCubeQuery(query, options);

    // view inferred as view_a from the panel filter -> AdHoc kept.
    expect(result.droppedAdHocFilters).toBeUndefined();
    expect(result.filters).toEqual(
      expect.arrayContaining([{ member: 'view_a.region', operator: Operator.Equals, values: ['uk'] }])
    );
  });

  it('skips AdHoc injection WITHOUT flagging drops when no view can be inferred (empty query)', () => {
    withAdHocFilters([{ key: 'view_a.region', operator: '=', value: 'uk' }]);
    const query = { refId: 'A' } as CubeQuery;

    const result = normalizeCubeQuery(query, options);

    // Filters are not injected (view unknown), but they are NOT reported as
    // dropped/inapplicable: they will apply once a dimension/measure is added,
    // so the SQL preview must not show a misleading "different view" hint (#307).
    expect(result.filters).toBeUndefined();
    expect(result.droppedAdHocFilters).toBeUndefined();
  });

  it('drops an AdHoc filter whose member is not present in metadata (unknown view)', () => {
    withAdHocFilters([{ key: 'orders.unknown', operator: '=', value: 'x' }]);
    const query = { refId: 'A', measures: ['view_a.count'] } as CubeQuery;

    const result = normalizeCubeQuery(query, options);

    expect(result.filters).toBeUndefined();
    expect(result.droppedAdHocFilters).toEqual([{ member: 'orders.unknown', operator: Operator.Equals, values: ['x'] }]);
  });

  it('keeps ALL AdHoc filters (prior behavior) when metadata is not provided', () => {
    withAdHocFilters([{ key: 'view_b.region', operator: '=', value: 'uk' }]);
    const query = { refId: 'A', measures: ['view_a.count'] } as CubeQuery;

    // baseOptions has no metadata -> no view scoping, inject everything.
    const result = normalizeCubeQuery(query, baseOptions);

    expect(result.filters).toEqual([{ member: 'view_b.region', operator: Operator.Equals, values: ['uk'] }]);
    expect(result.droppedAdHocFilters).toBeUndefined();
  });

  it('still injects the dashboard time dimension while dropping a cross-view AdHoc filter (interaction with #35/#173)', () => {
    mockGetTemplateSrv.mockReturnValue({
      getAdhocFilters: () => [{ key: 'view_b.region', operator: '=', value: 'uk' }],
      replace: (str: string) => {
        if (str === '$cubeTimeDimension') {
          return 'view_a.order_date';
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
    const query = { refId: 'A', measures: ['view_a.count'] } as CubeQuery;

    const result = normalizeCubeQuery(query, options);

    // Cross-view AdHoc dropped...
    expect(result.filters).toBeUndefined();
    expect(result.droppedAdHocFilters).toEqual([{ member: 'view_b.region', operator: Operator.Equals, values: ['uk'] }]);
    // ...but the dashboard time-range injection is unaffected.
    expect(result.timeDimensions).toEqual([
      { dimension: 'view_a.order_date', dateRange: [DASH_FROM_ISO, DASH_TO_ISO] },
    ]);
  });
});
