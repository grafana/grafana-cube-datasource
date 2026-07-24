import { buildScopingTagFilters } from './queries';
import { CubeFilter, Operator } from './types';

describe('buildScopingTagFilters (issue #32)', () => {
  it('returns empty array when there are no preceding or adhoc filters', () => {
    expect(buildScopingTagFilters(undefined, [])).toEqual([]);
    expect(buildScopingTagFilters([], [])).toEqual([]);
  });

  it('maps preceding equals filters to the "=" getTagValues shape', () => {
    const preceding: CubeFilter[] = [{ member: 'orders.last_name', operator: Operator.Equals, values: ['M.'] }];

    expect(buildScopingTagFilters(preceding, [])).toEqual([
      { key: 'orders.last_name', operator: '=', value: 'M.', values: ['M.'] },
    ]);
  });

  it('maps preceding notEquals filters to the "!=" symbol (not the default "=")', () => {
    const preceding: CubeFilter[] = [{ member: 'orders.status', operator: Operator.NotEquals, values: ['cancelled'] }];

    expect(buildScopingTagFilters(preceding, [])).toEqual([
      { key: 'orders.status', operator: '!=', value: 'cancelled', values: ['cancelled'] },
    ]);
  });

  it('preserves multi-value selections', () => {
    const preceding: CubeFilter[] = [
      { member: 'orders.region', operator: Operator.Equals, values: ['US', 'EU'] },
    ];

    expect(buildScopingTagFilters(preceding, [])).toEqual([
      { key: 'orders.region', operator: '=', value: 'US', values: ['US', 'EU'] },
    ]);
  });

  it('excludes incomplete preceding filters (no member or no values)', () => {
    const preceding = [
      { member: '', operator: Operator.Equals, values: ['x'] },
      { member: 'orders.status', operator: Operator.Equals, values: [] },
      { member: 'orders.status', operator: Operator.Equals },
    ] as CubeFilter[];

    expect(buildScopingTagFilters(preceding, [])).toEqual([]);
  });

  it('excludes preceding filters with operators the query builder does not support', () => {
    const preceding: CubeFilter[] = [
      { member: 'orders.amount', operator: Operator.Gt, values: ['100'] },
      { member: 'orders.name', operator: Operator.Contains, values: ['foo'] },
    ];

    expect(buildScopingTagFilters(preceding, [])).toEqual([]);
  });

  it('includes active adhoc filters and lists them before preceding filters (both-together case)', () => {
    const adhoc = [{ key: 'orders.last_name', operator: '=', value: 'M.', values: ['M.'] }];
    const preceding: CubeFilter[] = [{ member: 'orders.status', operator: Operator.Equals, values: ['completed'] }];

    expect(buildScopingTagFilters(preceding, adhoc)).toEqual([
      { key: 'orders.last_name', operator: '=', value: 'M.', values: ['M.'] },
      { key: 'orders.status', operator: '=', value: 'completed', values: ['completed'] },
    ]);
  });
});
