import { DataSource } from './datasource';
import { DataSourceInstanceSettings } from '@grafana/data';
import { CubeDataSourceOptions, CubeFilter, CubeQuery, Operator } from './types';
import { getTemplateSrv } from '@grafana/runtime';
import { of, lastValueFrom } from 'rxjs';

// Mock @grafana/runtime
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getTemplateSrv: jest.fn(),
}));

const mockGetTemplateSrv = getTemplateSrv as jest.Mock;

// Mock the getResource method
const mockGetResource = jest.fn();

const createDataSource = (options: Partial<CubeDataSourceOptions> = {}) => {
  const instanceSettings: DataSourceInstanceSettings<CubeDataSourceOptions> = {
    id: 1,
    uid: 'test-uid',
    type: 'cube-datasource',
    name: 'Test Cube',
    meta: {} as any,
    jsonData: {
      ...options,
    },
    readOnly: false,
    access: 'proxy',
  };

  const datasource = new DataSource(instanceSettings);
  datasource.getResource = mockGetResource;
  // Default single-view ("orders") metadata so getTagValues view-scoping (#498)
  // is a no-op for same-view members. Tests that need cross-view / cold behavior
  // override getCachedMetadata explicitly.
  datasource.getCachedMetadata = jest.fn().mockReturnValue({
    dimensions: [
      { label: 'orders.status', value: 'orders.status', type: 'string', cube: 'orders' },
      { label: 'orders.region', value: 'orders.region', type: 'string', cube: 'orders' },
      { label: 'orders.customer', value: 'orders.customer', type: 'string', cube: 'orders' },
      { label: 'orders.order_date', value: 'orders.order_date', type: 'time', cube: 'orders' },
    ],
    measures: [{ label: 'orders.count', value: 'orders.count', type: 'number', cube: 'orders' }],
  });
  return datasource;
};

describe('DataSource', () => {
  beforeEach(() => {
    mockGetResource.mockClear();
  });

  describe('getMetadata', () => {
    it('should call metadata endpoint', async () => {
      const mockMetadata = {
        dimensions: [
          { label: 'orders.status', value: 'orders.status' },
          { label: 'orders.customer_name', value: 'orders.customer_name' },
        ],
        measures: [
          { label: 'orders.count', value: 'orders.count' },
          { label: 'orders.total', value: 'orders.total' },
        ],
      };

      mockGetResource.mockResolvedValue(mockMetadata);
      const datasource = createDataSource();

      const result = await datasource.getMetadata();

      expect(mockGetResource).toHaveBeenCalledWith('metadata');
      expect(result).toEqual(mockMetadata);
    });

    it('should handle metadata endpoint errors', async () => {
      mockGetResource.mockRejectedValue(new Error('API Error'));
      const datasource = createDataSource();

      await expect(datasource.getMetadata()).rejects.toThrow('API Error');
      expect(mockGetResource).toHaveBeenCalledWith('metadata');
    });
  });

  describe('getTagKeys', () => {
    it('should transform metadata dimensions to TagKey format', async () => {
      const mockMetadata = {
        dimensions: [
          { label: 'orders.status', value: 'orders.status' },
          { label: 'orders.customer_name', value: 'orders.customer_name' },
        ],
        measures: [{ label: 'orders.count', value: 'orders.count' }],
      };

      mockGetResource.mockResolvedValue(mockMetadata);
      const datasource = createDataSource();

      const result = await datasource.getTagKeys();

      expect(mockGetResource).toHaveBeenCalledWith('metadata');
      expect(result).toEqual([
        { text: 'orders.status', value: 'orders.status' },
        { text: 'orders.customer_name', value: 'orders.customer_name' },
      ]);
    });

    it('should handle empty dimensions', async () => {
      const mockMetadata = {
        dimensions: [],
        measures: [{ label: 'orders.count', value: 'orders.count' }],
      };

      mockGetResource.mockResolvedValue(mockMetadata);
      const datasource = createDataSource();

      const result = await datasource.getTagKeys();

      expect(result).toEqual([]);
    });

    it('should propagate metadata errors', async () => {
      mockGetResource.mockRejectedValue(new Error('Metadata fetch failed'));
      const datasource = createDataSource();

      await expect(datasource.getTagKeys()).rejects.toThrow('Metadata fetch failed');
    });
  });

  describe('getTagValues', () => {
    it('should call tag-values endpoint with key', async () => {
      const mockValues = ['value1', 'value2'];
      mockGetResource.mockResolvedValue(mockValues);
      const datasource = createDataSource();

      const result = await datasource.getTagValues({ key: 'orders.status' });

      expect(mockGetResource).toHaveBeenCalledWith('tag-values', { key: 'orders.status', filters: undefined });
      expect(result).toEqual(mockValues);
    });

    it('should pass existing filters to scope tag values', async () => {
      const mockValues = ['filtered1', 'filtered2'];
      mockGetResource.mockResolvedValue(mockValues);
      const datasource = createDataSource();

      const existingFilters = [
        { key: 'orders.status', operator: '=', value: 'completed' },
        { key: 'orders.region', operator: '=|', value: 'US', values: ['US', 'EU'] },
      ];

      const result = await datasource.getTagValues({ key: 'orders.customer', filters: existingFilters });

      expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
        key: 'orders.customer',
        filters: JSON.stringify([
          { member: 'orders.status', operator: 'equals', values: ['completed'] },
          { member: 'orders.region', operator: 'equals', values: ['US', 'EU'] },
        ]),
      });
      expect(result).toEqual(mockValues);
    });

    it('should handle empty filters array', async () => {
      const mockValues = ['value1'];
      mockGetResource.mockResolvedValue(mockValues);
      const datasource = createDataSource();

      const result = await datasource.getTagValues({ key: 'orders.status', filters: [] });

      expect(mockGetResource).toHaveBeenCalledWith('tag-values', { key: 'orders.status', filters: undefined });
      expect(result).toEqual(mockValues);
    });

    describe('time-range scoping ($cubeTimeDimension) — issue #35', () => {
      const makeTimeRange = () => ({
        from: { toISOString: () => '2018-03-01T00:00:00.000Z' },
        to: { toISOString: () => '2018-03-31T23:59:59.000Z' },
      });

      it('should pass timeDimensions when $cubeTimeDimension is set and timeRange is provided', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({
          replace: (str: string) => (str === '$cubeTimeDimension' ? 'orders.order_date' : str),
        });
        const datasource = createDataSource();

        await datasource.getTagValues({ key: 'orders.customer', timeRange: makeTimeRange() as any });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'orders.customer',
          filters: undefined,
          timeDimensions: JSON.stringify([
            {
              dimension: 'orders.order_date',
              dateRange: ['2018-03-01T00:00:00.000Z', '2018-03-31T23:59:59.000Z'],
            },
          ]),
        });
      });

      it('should combine time dimensions with existing scoping filters', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({
          replace: (str: string) => (str === '$cubeTimeDimension' ? 'orders.order_date' : str),
        });
        const datasource = createDataSource();

        await datasource.getTagValues({
          key: 'orders.customer',
          filters: [{ key: 'orders.status', operator: '=', value: 'completed' }],
          timeRange: makeTimeRange() as any,
        });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'orders.customer',
          filters: JSON.stringify([{ member: 'orders.status', operator: 'equals', values: ['completed'] }]),
          timeDimensions: JSON.stringify([
            {
              dimension: 'orders.order_date',
              dateRange: ['2018-03-01T00:00:00.000Z', '2018-03-31T23:59:59.000Z'],
            },
          ]),
        });
      });

      it('should NOT pass timeDimensions when $cubeTimeDimension is not set (unchanged behavior)', async () => {
        mockGetResource.mockResolvedValue([]);
        // replace returns the token unchanged => variable not configured
        mockGetTemplateSrv.mockReturnValue({ replace: (str: string) => str });
        const datasource = createDataSource();

        await datasource.getTagValues({ key: 'orders.customer', timeRange: makeTimeRange() as any });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'orders.customer',
          filters: undefined,
          timeDimensions: undefined,
        });
      });

      it('should NOT pass timeDimensions when Grafana provides no timeRange', async () => {
        mockGetResource.mockResolvedValue([]);
        const replace = jest.fn((str: string) => 'orders.order_date');
        mockGetTemplateSrv.mockReturnValue({ replace });
        const datasource = createDataSource();

        await datasource.getTagValues({ key: 'orders.customer' });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'orders.customer',
          filters: undefined,
          timeDimensions: undefined,
        });
        // templateSrv must not even be consulted when there is no timeRange.
        expect(replace).not.toHaveBeenCalled();
      });
    });

    describe('view-scoping of scoping filters + time dimension (issue #498)', () => {
      const twoViewMetadata = {
        dimensions: [
          { label: 'customers.location', value: 'customers.location', type: 'string', cube: 'customers' },
          { label: 'customers.name', value: 'customers.name', type: 'string', cube: 'customers' },
          { label: 'customers.created_at', value: 'customers.created_at', type: 'time', cube: 'customers' },
          { label: 'ad_campaigns.platform', value: 'ad_campaigns.platform', type: 'string', cube: 'ad_campaigns' },
          { label: 'ad_campaigns.region', value: 'ad_campaigns.region', type: 'string', cube: 'ad_campaigns' },
        ],
        measures: [{ label: 'ad_campaigns.clicks', value: 'ad_campaigns.clicks', type: 'number', cube: 'ad_campaigns' }],
      };
      const makeTimeRange = () => ({
        from: { toISOString: () => '2018-03-01T00:00:00.000Z' },
        to: { toISOString: () => '2018-03-31T23:59:59.000Z' },
      });
      const withTwoViews = () => {
        const datasource = createDataSource();
        datasource.getCachedMetadata = jest.fn().mockReturnValue(twoViewMetadata);
        return datasource;
      };

      it('keeps same-view scoping filters and drops cross-view ones', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s });
        const datasource = withTwoViews();

        await datasource.getTagValues({
          key: 'ad_campaigns.platform',
          filters: [
            { key: 'customers.location', operator: '=', value: 'uk' }, // cross-view -> drop
            { key: 'ad_campaigns.region', operator: '=', value: 'emea' }, // same view -> keep
          ],
        });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'ad_campaigns.platform',
          filters: JSON.stringify([{ member: 'ad_campaigns.region', operator: 'equals', values: ['emea'] }]),
          timeDimensions: undefined,
        });
      });

      it('drops ALL scoping filters when every one is cross-view (unscoped beats error)', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s });
        const datasource = withTwoViews();

        await datasource.getTagValues({
          key: 'ad_campaigns.platform',
          filters: [{ key: 'customers.location', operator: '=', value: 'uk' }],
        });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'ad_campaigns.platform',
          filters: undefined,
          timeDimensions: undefined,
        });
      });

      it('drops ALL scoping filters when the key itself is not in metadata (stale/unknown)', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s });
        const datasource = withTwoViews();

        await datasource.getTagValues({
          key: 'gone.member',
          filters: [{ key: 'ad_campaigns.region', operator: '=', value: 'emea' }],
        });

        // Cannot resolve the key's view -> attempt unscoped rather than error.
        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'gone.member',
          filters: undefined,
          timeDimensions: undefined,
        });
      });

      it('represents the query-builder useMemberValuesQuery surface: cross-view AdHoc dropped', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s });
        const datasource = withTwoViews();

        // useMemberValuesQuery threads active dashboard AdHoc filters into the
        // same getTagValues lookup; a cross-view one must not reach the backend.
        await datasource.getTagValues({
          key: 'customers.name',
          filters: [{ key: 'ad_campaigns.platform', operator: '=', value: 'google' }],
        });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'customers.name',
          filters: undefined,
          timeDimensions: undefined,
        });
      });

      it('injects $cubeTimeDimension when it is in the SAME view as key', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({
          replace: (s: string) => (s === '$cubeTimeDimension' ? 'customers.created_at' : s),
        });
        const datasource = withTwoViews();

        await datasource.getTagValues({ key: 'customers.name', timeRange: makeTimeRange() as any });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'customers.name',
          filters: undefined,
          timeDimensions: JSON.stringify([
            { dimension: 'customers.created_at', dateRange: ['2018-03-01T00:00:00.000Z', '2018-03-31T23:59:59.000Z'] },
          ]),
        });
      });

      it('drops $cubeTimeDimension when it is in a DIFFERENT view than key (#35 interaction)', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({
          replace: (s: string) => (s === '$cubeTimeDimension' ? 'customers.created_at' : s),
        });
        const datasource = withTwoViews();

        // key in ad_campaigns view, time dimension in customers view -> drop it.
        await datasource.getTagValues({ key: 'ad_campaigns.platform', timeRange: makeTimeRange() as any });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'ad_campaigns.platform',
          filters: undefined,
          timeDimensions: undefined,
        });
      });

      it('awaits getMetadata on a cold cache and uses it to partition (cold path)', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s });

        const datasource = createDataSource();
        datasource.getCachedMetadata = jest.fn().mockReturnValue(null); // cold
        datasource.getMetadata = jest.fn().mockResolvedValue(twoViewMetadata);

        await datasource.getTagValues({
          key: 'ad_campaigns.platform',
          filters: [
            { key: 'customers.location', operator: '=', value: 'uk' }, // cross-view -> drop
            { key: 'ad_campaigns.region', operator: '=', value: 'emea' }, // same view -> keep
          ],
        });

        expect(datasource.getMetadata).toHaveBeenCalledTimes(1);
        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'ad_campaigns.platform',
          filters: JSON.stringify([{ member: 'ad_campaigns.region', operator: 'equals', values: ['emea'] }]),
          timeDimensions: undefined,
        });
      });

      it('uses the cached metadata without re-fetching on a warm cache (warm path)', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s });

        const datasource = withTwoViews(); // getCachedMetadata returns metadata
        datasource.getMetadata = jest.fn(); // must NOT be called

        await datasource.getTagValues({
          key: 'ad_campaigns.platform',
          filters: [{ key: 'customers.location', operator: '=', value: 'uk' }],
        });

        expect(datasource.getMetadata).not.toHaveBeenCalled();
        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'ad_campaigns.platform',
          filters: undefined, // cross-view dropped using the cached metadata
          timeDimensions: undefined,
        });
      });

      it('skips the metadata fetch entirely when there are no filters and no timeRange', async () => {
        mockGetResource.mockResolvedValue([]);
        const datasource = withTwoViews();
        const getCached = datasource.getCachedMetadata as jest.Mock;
        datasource.getMetadata = jest.fn();
        getCached.mockClear();

        await datasource.getTagValues({ key: 'ad_campaigns.platform' });

        expect(datasource.getMetadata).not.toHaveBeenCalled();
        expect(getCached).not.toHaveBeenCalled();
        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'ad_campaigns.platform',
          filters: undefined,
          timeDimensions: undefined,
        });
      });

      it('forwards scoping filters unchanged when metadata is unavailable (prior behavior)', async () => {
        mockGetResource.mockResolvedValue([]);
        mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s });
        const datasource = createDataSource();
        // No metadata at all: cache null and getMetadata fails.
        datasource.getCachedMetadata = jest.fn().mockReturnValue(null);
        datasource.getMetadata = jest.fn().mockRejectedValue(new Error('no meta'));

        await datasource.getTagValues({
          key: 'ad_campaigns.platform',
          filters: [{ key: 'customers.location', operator: '=', value: 'uk' }],
        });

        expect(mockGetResource).toHaveBeenCalledWith('tag-values', {
          key: 'ad_campaigns.platform',
          filters: JSON.stringify([{ member: 'customers.location', operator: 'equals', values: ['uk'] }]),
          timeDimensions: undefined,
        });
      });
    });
  });

  describe('applyTemplateVariables', () => {
    it('should interpolate template variables in filter values', () => {
      const mockReplace = jest.fn((str: string) => {
        if (str === '$filterValue') {
          return 'completed';
        }
        return str;
      });

      mockGetTemplateSrv.mockReturnValue({
        replace: mockReplace,
        getVariables: () => [],
        getAdhocFilters: () => [],
      });

      const datasource = createDataSource();

      const query = {
        refId: 'A',
        dimensions: ['orders.status'],
        measures: ['orders.count'],
        filters: [
          {
            member: 'orders.status',
            operator: Operator.Equals,
            values: ['$filterValue'],
          },
        ],
      };

      const result = datasource.applyTemplateVariables(query, {});

      expect(result.filters).toBeDefined();
      expect((result.filters![0] as CubeFilter).values).toContain('completed');
    });

    it('applies AdHoc filters from the third-argument filters list (issue #127)', () => {
      mockGetTemplateSrv.mockReturnValue({
        replace: (s: string) => s,
        getVariables: () => [],
        getAdhocFilters: () => [],
      });

      const datasource = createDataSource();
      const query = {
        refId: 'A',
        dimensions: ['orders.status'],
        measures: ['orders.count'],
      };

      const result = datasource.applyTemplateVariables(query, {}, [
        { key: 'orders.status', operator: '=', value: 'completed' },
      ]);

      expect(result.filters).toEqual([
        { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
      ]);
    });

    it('honors an explicit empty filters list and does NOT fall back to the deprecated global (Explore no-filters, #127)', () => {
      mockGetTemplateSrv.mockReturnValue({
        replace: (s: string) => s,
        getVariables: () => [], // no dashboard AdHoc variables
        // A stale global that must NOT leak in when Explore passes filters: [].
        getAdhocFilters: () => [{ key: 'orders.status', operator: '=', value: 'STALE' }],
      });

      const datasource = createDataSource();
      const query = {
        refId: 'A',
        dimensions: ['orders.status'],
        measures: ['orders.count'],
      };

      // Explicit empty list is passed AS-IS (no []->undefined coercion), so
      // resolveAdHocFilters honors it and does not consult the deprecated API.
      const result = datasource.applyTemplateVariables(query, {}, []);

      expect(result.filters).toBeUndefined();
    });

    it('recovers AdHoc filters from dashboard variables when Grafana passes an empty list (scenes miss, #127)', () => {
      mockGetTemplateSrv.mockReturnValue({
        replace: (s: string) => s,
        getVariables: () => [
          {
            type: 'adhoc',
            datasource: { uid: 'test-uid' },
            filters: [{ key: 'orders.status', operator: '=', value: 'completed' }],
          },
        ],
        getAdhocFilters: () => [],
      });

      const datasource = createDataSource();
      const query = {
        refId: 'A',
        dimensions: ['orders.status'],
        measures: ['orders.count'],
      };

      // Empty explicit list still recovers via getVariables (step 2).
      const result = datasource.applyTemplateVariables(query, {}, []);

      expect(result.filters).toEqual([
        { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
      ]);
    });

    it('drops cross-view AdHoc filters passed via the third argument (issues #127 + #307)', () => {
      mockGetTemplateSrv.mockReturnValue({
        replace: (s: string) => s,
        getVariables: () => [],
        getAdhocFilters: () => [],
      });

      const datasource = createDataSource();
      // Seed cached metadata so view-scoping is active.
      (datasource as any).cachedMetadata = {
        dimensions: [
          { label: 'orders.status', value: 'orders.status', type: 'string', cube: 'orders' },
          { label: 'customers.segment', value: 'customers.customer_segment', type: 'string', cube: 'customers' },
        ],
        measures: [
          { label: 'orders.count', value: 'orders.count', type: 'number', cube: 'orders' },
          { label: 'customers.count', value: 'customers.count', type: 'number', cube: 'customers' },
        ],
      };

      const customersQuery = {
        refId: 'A',
        dimensions: ['customers.customer_segment'],
        measures: ['customers.count'],
      };

      const result = datasource.applyTemplateVariables(customersQuery, {}, [
        { key: 'orders.status', operator: '=', value: 'completed' },
      ]);

      // Cross-view AdHoc filter must NOT be injected into the customers query.
      expect(result.filters).toBeUndefined();
    });

    describe('dashboard-level time dimension', () => {
      it('should inject time dimension when $cubeTimeDimension variable is set and query has no timeDimensions', () => {
        const fromTimestamp = '1701388800000'; // 2023-12-01T00:00:00.000Z
        const toTimestamp = '1701475200000'; // 2023-12-02T00:00:00.000Z

        const mockReplace = jest.fn((str: string) => {
          if (str === '$cubeTimeDimension') {
            return 'orders.created_at';
          }
          if (str === '$__from') {
            return fromTimestamp;
          }
          if (str === '$__to') {
            return toTimestamp;
          }
          return str;
        });

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.timeDimensions).toBeDefined();
        expect(result.timeDimensions).toHaveLength(1);
        expect(result.timeDimensions![0]).toEqual({
          dimension: 'orders.created_at',
          dateRange: ['2023-12-01T00:00:00.000Z', '2023-12-02T00:00:00.000Z'],
        });
      });

      it('should ADD the dashboard time range alongside a panel timeDimension for a DIFFERENT dimension (issue #173)', () => {
        const mockReplace = jest.fn((str: string) => {
          if (str === '$cubeTimeDimension') {
            return 'orders.created_at';
          }
          if (str === '$__from') {
            return '1701388800000';
          }
          if (str === '$__to') {
            return '1701475200000';
          }
          return str;
        });

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
          timeDimensions: [
            {
              dimension: 'orders.updated_at',
              granularity: 'day',
            },
          ],
        };

        const result = datasource.applyTemplateVariables(query, {});

        // Panel entry is preserved AND the dashboard range is appended as a
        // separate entry so it still narrows results.
        expect(result.timeDimensions).toHaveLength(2);
        expect(result.timeDimensions![0]).toEqual({ dimension: 'orders.updated_at', granularity: 'day' });
        expect(result.timeDimensions![1]).toEqual({
          dimension: 'orders.created_at',
          dateRange: ['2023-12-01T00:00:00.000Z', '2023-12-02T00:00:00.000Z'],
        });
      });

      it('should AND the dashboard range with a panel timeDimension for the SAME dimension (issue #173 intersection)', () => {
        const mockReplace = jest.fn((str: string) => {
          if (str === '$cubeTimeDimension') {
            return 'orders.created_at';
          }
          if (str === '$__from') {
            return '1701388800000'; // 2023-12-01
          }
          if (str === '$__to') {
            return '1701475200000'; // 2023-12-02
          }
          return str;
        });

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          measures: ['orders.count'],
          timeDimensions: [
            {
              dimension: 'orders.created_at',
              dateRange: ['2018-01-01T00:00:00.000Z', '2018-12-31T00:00:00.000Z'],
            },
          ],
        } as unknown as CubeQuery;

        const result = datasource.applyTemplateVariables(query, {});

        // Both same-dimension entries are sent; Cube ANDs the two dateRanges,
        // producing the intersection (here: empty, 2018 vs 2023).
        expect(result.timeDimensions).toHaveLength(2);
        expect(result.timeDimensions![0]).toEqual({
          dimension: 'orders.created_at',
          dateRange: ['2018-01-01T00:00:00.000Z', '2018-12-31T00:00:00.000Z'],
        });
        expect(result.timeDimensions![1]).toEqual({
          dimension: 'orders.created_at',
          dateRange: ['2023-12-01T00:00:00.000Z', '2023-12-02T00:00:00.000Z'],
        });
      });

      it('should NOT add the dashboard range to an existing timeDimension when $cubeTimeDimension is not configured (issue #173 — unchanged)', () => {
        // Variable unset: replace returns the token unchanged.
        const mockReplace = jest.fn((str: string) => str);

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          measures: ['orders.count'],
          timeDimensions: [
            {
              dimension: 'orders.created_at',
              dateRange: ['2018-01-01T00:00:00.000Z', '2018-12-31T00:00:00.000Z'],
            },
          ],
        } as unknown as CubeQuery;

        const result = datasource.applyTemplateVariables(query, {});

        // Behavior unchanged: only the panel's own timeDimension remains.
        expect(result.timeDimensions).toHaveLength(1);
        expect(result.timeDimensions![0]).toEqual({
          dimension: 'orders.created_at',
          dateRange: ['2018-01-01T00:00:00.000Z', '2018-12-31T00:00:00.000Z'],
        });
      });

      it('should NOT add the dashboard range to an existing timeDimension when the time range is unavailable (issue #173 — unchanged)', () => {
        const mockReplace = jest.fn((str: string) => {
          if (str === '$cubeTimeDimension') {
            return 'orders.created_at';
          }
          // $__from / $__to unavailable (returned unchanged).
          return str;
        });

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          measures: ['orders.count'],
          timeDimensions: [
            {
              dimension: 'orders.updated_at',
              granularity: 'day',
            },
          ],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.timeDimensions).toHaveLength(1);
        expect(result.timeDimensions![0]).toEqual({ dimension: 'orders.updated_at', granularity: 'day' });
      });

      it('should not inject time dimension when $cubeTimeDimension variable is not set', () => {
        const mockReplace = jest.fn((str: string) => {
          // Return the variable name unchanged when not set
          return str;
        });

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.timeDimensions).toBeUndefined();
      });

      it('should not inject time dimension when time range variables are not available', () => {
        const mockReplace = jest.fn((str: string) => {
          if (str === '$cubeTimeDimension') {
            return 'orders.created_at';
          }
          // Return unchanged for time range variables (simulating they're not available)
          return str;
        });

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.timeDimensions).toBeUndefined();
      });

      it('should not inject time dimension when $__from or $__to are invalid', () => {
        const mockReplace = jest.fn((str: string) => {
          if (str === '$cubeTimeDimension') {
            return 'orders.created_at';
          }
          if (str === '$__from') {
            return 'invalid';
          }
          if (str === '$__to') {
            return '1701475200000';
          }
          return str;
        });

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.timeDimensions).toBeUndefined();
      });
    });

    describe('AdHoc filter operators', () => {
      it('should map "One of" operator (=|) to Cube equals with multiple values', () => {
        const mockReplace = jest.fn((str: string) => str);

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [
            {
              key: 'orders.status',
              operator: '=|',
              value: 'completed',
              values: ['completed', 'shipped', 'delivered'],
            },
          ],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.filters).toBeDefined();
        expect(result.filters).toHaveLength(1);
        expect(result.filters![0]).toEqual({
          member: 'orders.status',
          operator: 'equals',
          values: ['completed', 'shipped', 'delivered'],
        });
      });

      it('should map "Not one of" operator (!=|) to Cube notEquals with multiple values', () => {
        const mockReplace = jest.fn((str: string) => str);

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [
            {
              key: 'orders.status',
              operator: '!=|',
              value: 'cancelled',
              values: ['cancelled', 'refunded'],
            },
          ],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.filters).toBeDefined();
        expect(result.filters).toHaveLength(1);
        expect(result.filters![0]).toEqual({
          member: 'orders.status',
          operator: 'notEquals',
          values: ['cancelled', 'refunded'],
        });
      });

      it('should fall back to single value when values array is empty', () => {
        const mockReplace = jest.fn((str: string) => str);

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [
            {
              key: 'orders.status',
              operator: '=',
              value: 'completed',
              values: [], // Empty values array
            },
          ],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.filters).toBeDefined();
        expect((result.filters![0] as CubeFilter).values).toEqual(['completed']);
      });

      it('should handle standard single-value operators', () => {
        const mockReplace = jest.fn((str: string) => str);

        mockGetTemplateSrv.mockReturnValue({
          replace: mockReplace,
          getAdhocFilters: () => [
            { key: 'orders.status', operator: '=', value: 'completed' },
            { key: 'orders.customer', operator: '!=', value: 'test' },
          ],
        });

        const datasource = createDataSource();

        const query = {
          refId: 'A',
          dimensions: ['orders.status'],
          measures: ['orders.count'],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.filters).toHaveLength(2);
        expect((result.filters![0] as CubeFilter).operator).toBe('equals');
        expect((result.filters![1] as CubeFilter).operator).toBe('notEquals');
      });
    });

    describe('filter validation', () => {
      beforeEach(() => {
        // Reset template srv mock to avoid AdHoc filters from previous tests
        mockGetTemplateSrv.mockReturnValue({
          replace: (str: string) => str,
          getAdhocFilters: () => [],
        });
      });

      it('should strip out filters with empty values', () => {
        const datasource = createDataSource();

        const query = {
          refId: 'A',
          measures: ['orders.count'],
          filters: [
            { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
            { member: 'orders.type', operator: Operator.Equals, values: [] }, // should be stripped
            { member: 'orders.customer', operator: Operator.NotEquals, values: ['test'] },
          ],
        };

        const result = datasource.applyTemplateVariables(query, {});

        // Only valid filters should remain
        expect(result.filters).toHaveLength(2);
        expect((result.filters![0] as CubeFilter).member).toBe('orders.status');
        expect((result.filters![1] as CubeFilter).member).toBe('orders.customer');
      });

      it('should strip values from unary operators for runtime parity', () => {
        const datasource = createDataSource();

        const query = {
          refId: 'A',
          measures: ['orders.count'],
          filters: [{ member: 'orders.discount', operator: Operator.Set, values: ['unexpected'] }],
        };

        const result = datasource.applyTemplateVariables(query, {});

        expect(result.filters).toEqual([{ member: 'orders.discount', operator: 'set' }]);
      });
    });

  });

  describe('filterQuery', () => {
    it('should return false when query has no dimensions or measures', () => {
      const datasource = createDataSource();

      const query = { refId: 'A' };
      expect(datasource.filterQuery(query)).toBe(false);
    });

    it('should return true when query has only dimensions (no measures)', () => {
      const datasource = createDataSource();

      const query = { refId: 'A', dimensions: ['orders.status'] };
      expect(datasource.filterQuery(query)).toBe(true);
    });

    it('should return true when query has only measures (no dimensions)', () => {
      const datasource = createDataSource();

      const query = { refId: 'A', measures: ['orders.count'] };
      expect(datasource.filterQuery(query)).toBe(true);
    });
  });

  describe('query() metadata gating (issue #307 cold-start)', () => {
    const superProto = Object.getPrototypeOf(DataSource.prototype);

    it('awaits metadata BEFORE running the first query when the cache is cold', async () => {
      const metadata = {
        dimensions: [{ label: 'orders.status', value: 'orders.status', type: 'string', cube: 'orders' }],
        measures: [],
      };
      mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s, getAdhocFilters: () => [] });

      const datasource = createDataSource();
      // Force a cold cache (ignore any best-effort constructor prefetch).
      (datasource as any).cachedMetadata = null;

      const order: string[] = [];
      mockGetResource.mockImplementation(async (path: string) => {
        if (path === 'metadata') {
          order.push('metadata');
          return metadata;
        }
        return {};
      });
      const superSpy = jest.spyOn(superProto, 'query').mockImplementation(() => {
        order.push('query');
        return of({ data: [] });
      });

      await lastValueFrom(datasource.query({ targets: [] } as any));

      // Metadata is fetched first, THEN the backend query runs -> no cold race.
      expect(order).toEqual(['metadata', 'query']);
      expect((datasource as any).cachedMetadata).toEqual(metadata);

      superSpy.mockRestore();
    });

    it('does NOT re-fetch metadata when the cache is already warm', async () => {
      const datasource = createDataSource();
      (datasource as any).cachedMetadata = { dimensions: [], measures: [] };

      mockGetResource.mockClear();
      const superSpy = jest.spyOn(superProto, 'query').mockReturnValue(of({ data: [] }));

      await lastValueFrom(datasource.query({ targets: [] } as any));

      expect(superSpy).toHaveBeenCalledTimes(1);
      expect(mockGetResource).not.toHaveBeenCalledWith('metadata');

      superSpy.mockRestore();
    });

    it('collapses a cold burst of concurrent queries into a single /v1/meta fetch', async () => {
      const metadata = { dimensions: [], measures: [] };
      mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s, getAdhocFilters: () => [] });

      const datasource = createDataSource();
      (datasource as any).cachedMetadata = null;
      (datasource as any).metadataInFlight = null;

      let metaCalls = 0;
      mockGetResource.mockImplementation(async (path: string) => {
        if (path === 'metadata') {
          metaCalls++;
          // Defer so all concurrent callers observe the same in-flight promise.
          await new Promise((resolve) => setTimeout(resolve, 5));
          return metadata;
        }
        return {};
      });
      const superSpy = jest.spyOn(superProto, 'query').mockReturnValue(of({ data: [] }));

      // Three panels query concurrently on a cold cache.
      await Promise.all([
        lastValueFrom(datasource.query({ targets: [] } as any)),
        lastValueFrom(datasource.query({ targets: [] } as any)),
        lastValueFrom(datasource.query({ targets: [] } as any)),
      ]);

      expect(metaCalls).toBe(1);
      expect(superSpy).toHaveBeenCalledTimes(3);

      superSpy.mockRestore();
    });

    it('still runs the query (inject-all fallback) when metadata fetch fails on cold start', async () => {
      const datasource = createDataSource();
      (datasource as any).cachedMetadata = null;

      mockGetResource.mockImplementation(async (path: string) => {
        if (path === 'metadata') {
          throw new Error('metadata unavailable');
        }
        return {};
      });
      const superSpy = jest.spyOn(superProto, 'query').mockReturnValue(of({ data: [] }));

      await lastValueFrom(datasource.query({ targets: [] } as any));

      expect(superSpy).toHaveBeenCalledTimes(1);
      expect((datasource as any).cachedMetadata).toBeNull();

      superSpy.mockRestore();
    });
  });
});
