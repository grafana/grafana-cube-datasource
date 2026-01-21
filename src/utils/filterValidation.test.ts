import { isValidCubeFilter, filterValidCubeFilters } from './filterValidation';
import { CubeFilter, Operator } from '../types';

describe('filterValidation', () => {
  describe('isValidCubeFilter', () => {
    it('returns false when filter has no member', () => {
      const filter: CubeFilter = {
        member: '',
        operator: Operator.Equals,
        values: ['value1'],
      };
      expect(isValidCubeFilter(filter)).toBe(false);
    });

    it('returns false when equals filter has empty values', () => {
      const filter: CubeFilter = {
        member: 'orders.status',
        operator: Operator.Equals,
        values: [],
      };
      expect(isValidCubeFilter(filter)).toBe(false);
    });

    it('returns false when notEquals filter has empty values', () => {
      const filter: CubeFilter = {
        member: 'orders.status',
        operator: Operator.NotEquals,
        values: [],
      };
      expect(isValidCubeFilter(filter)).toBe(false);
    });

    it('returns true when equals filter has values', () => {
      const filter: CubeFilter = {
        member: 'orders.status',
        operator: Operator.Equals,
        values: ['completed'],
      };
      expect(isValidCubeFilter(filter)).toBe(true);
    });

    it('returns true when notEquals filter has values', () => {
      const filter: CubeFilter = {
        member: 'orders.status',
        operator: Operator.NotEquals,
        values: ['pending'],
      };
      expect(isValidCubeFilter(filter)).toBe(true);
    });

    it('returns true when filter has multiple values', () => {
      const filter: CubeFilter = {
        member: 'orders.status',
        operator: Operator.Equals,
        values: ['completed', 'pending', 'shipped'],
      };
      expect(isValidCubeFilter(filter)).toBe(true);
    });
  });

  describe('filterValidCubeFilters', () => {
    it('filters out invalid filters from array', () => {
      const filters: CubeFilter[] = [
        { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
        { member: 'orders.type', operator: Operator.Equals, values: [] }, // invalid: empty values
        { member: '', operator: Operator.Equals, values: ['value'] }, // invalid: no member
        { member: 'orders.customer', operator: Operator.NotEquals, values: ['test'] },
      ];

      const result = filterValidCubeFilters(filters);

      expect(result).toHaveLength(2);
      expect(result[0].member).toBe('orders.status');
      expect(result[1].member).toBe('orders.customer');
    });

    it('returns empty array when all filters are invalid', () => {
      const filters: CubeFilter[] = [
        { member: 'orders.status', operator: Operator.Equals, values: [] },
        { member: '', operator: Operator.Equals, values: ['value'] },
      ];

      const result = filterValidCubeFilters(filters);

      expect(result).toHaveLength(0);
    });

    it('returns all filters when all are valid', () => {
      const filters: CubeFilter[] = [
        { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
        { member: 'orders.customer', operator: Operator.NotEquals, values: ['test'] },
      ];

      const result = filterValidCubeFilters(filters);

      expect(result).toHaveLength(2);
    });
  });
});
