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

    // New operator tests
    it.each([
      Operator.Contains,
      Operator.NotContains,
      Operator.StartsWith,
      Operator.NotStartsWith,
      Operator.EndsWith,
      Operator.NotEndsWith,
      Operator.Gt,
      Operator.Gte,
      Operator.Lt,
      Operator.Lte,
      Operator.InDateRange,
      Operator.NotInDateRange,
      Operator.BeforeDate,
      Operator.BeforeOrOnDate,
      Operator.AfterDate,
      Operator.AfterOrOnDate,
    ])('returns true for binary operator %s with values', (operator) => {
      const filter: CubeFilter = { member: 'orders.amount', operator, values: ['100'] };
      expect(isValidCubeFilter(filter)).toBe(true);
    });

    it.each([
      Operator.Contains,
      Operator.Gt,
      Operator.Lt,
      Operator.InDateRange,
    ])('returns false for binary operator %s without values', (operator) => {
      const filter: CubeFilter = { member: 'orders.amount', operator, values: [] };
      expect(isValidCubeFilter(filter)).toBe(false);
    });

    it('returns true for set operator without values', () => {
      const filter: CubeFilter = { member: 'orders.status', operator: Operator.Set };
      expect(isValidCubeFilter(filter)).toBe(true);
    });

    it('returns true for notSet operator without values', () => {
      const filter: CubeFilter = { member: 'orders.status', operator: Operator.NotSet };
      expect(isValidCubeFilter(filter)).toBe(true);
    });

    it('returns false for set operator without member', () => {
      const filter: CubeFilter = { member: '', operator: Operator.Set };
      expect(isValidCubeFilter(filter)).toBe(false);
    });

    it('validates measure filters the same as dimension filters', () => {
      const filter: CubeFilter = {
        member: 'orders.count',
        operator: Operator.Gt,
        values: ['10'],
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

    it('keeps valid filters with advanced operators and unary operators', () => {
      const filters: CubeFilter[] = [
        { member: 'orders.amount', operator: Operator.Gt, values: ['100'] },
        { member: 'orders.status', operator: Operator.Set },
        { member: 'orders.name', operator: Operator.Contains, values: [] }, // invalid
      ];

      const result = filterValidCubeFilters(filters);

      expect(result).toHaveLength(2);
      expect(result[0].operator).toBe('gt');
      expect(result[1].operator).toBe('set');
    });
  });
});
