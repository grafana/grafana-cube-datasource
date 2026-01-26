import { DataSource } from './datasource';
import { DataSourceInstanceSettings } from '@grafana/data';
import { CubeDataSourceOptions, Operator } from './types';
import { getTemplateSrv } from '@grafana/runtime';

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
      cubeApiUrl: 'http://localhost:4000',
      ...options,
    },
    readOnly: false,
    access: 'proxy',
  };

  const datasource = new DataSource(instanceSettings);
  datasource.getResource = mockGetResource;
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
  });

  describe('applyTemplateVariables', () => {
    it('should interpolate template variables in filter member and values', () => {
      // Setup mock for getTemplateSrv
      const mockReplace = jest.fn((str: string) => {
        if (str === '$dimension') {
          return 'orders.status';
        }
        if (str === '$filterValue') {
          return 'completed';
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
        dimensions: ['$dimension'],
        measures: ['orders.count'],
        filters: [
          {
            member: '$dimension',
            operator: Operator.Equals,
            values: ['$filterValue'],
          },
        ],
      };

      const result = datasource.applyTemplateVariables(query, {});

      // Verify filters are interpolated
      expect(result.filters).toBeDefined();
      expect(result.filters![0].member).toBe('orders.status');
      expect(result.filters![0].values).toContain('completed');
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

      it('should not inject time dimension when query already has timeDimensions', () => {
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

        // Should preserve existing timeDimensions, not override
        expect(result.timeDimensions).toHaveLength(1);
        expect(result.timeDimensions![0].dimension).toBe('orders.updated_at');
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
        expect(result.filters![0].values).toEqual(['completed']);
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
        expect(result.filters![0].operator).toBe('equals');
        expect(result.filters![1].operator).toBe('notEquals');
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
        expect(result.filters![0].member).toBe('orders.status');
        expect(result.filters![1].member).toBe('orders.customer');
      });
    });
  });
});
