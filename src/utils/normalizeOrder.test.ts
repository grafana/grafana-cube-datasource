import type { TQueryOrderArray } from '@cubejs-client/core';
import { normalizeOrder, OrderArray, OrderRecord } from './normalizeOrder';

describe('normalizeOrder', () => {
  it('should return undefined for undefined input', () => {
    expect(normalizeOrder(undefined)).toBeUndefined();
  });

  it('should return array format with valid directions', () => {
    const arrayOrder: OrderArray = [
      ['orders.count', 'desc'],
      ['orders.status', 'asc'],
    ];
    expect(normalizeOrder(arrayOrder)).toEqual(arrayOrder);
  });

  it('should convert object format to array format', () => {
    const objectOrder: OrderRecord = { 'orders.count': 'desc', 'orders.status': 'asc' };
    const result = normalizeOrder(objectOrder);
    expect(result).toEqual([
      ['orders.count', 'desc'],
      ['orders.status', 'asc'],
    ]);
  });

  it('should return undefined for empty object', () => {
    const result = normalizeOrder({});
    expect(result).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    const result = normalizeOrder([]);
    expect(result).toBeUndefined();
  });

  it('should filter out entries with none direction', () => {
    // Using TQueryOrderArray to simulate Cube's type that includes 'none'
    const orderWithNone: TQueryOrderArray = [
      ['orders.count', 'desc'],
      ['orders.status', 'none'],
      ['orders.total', 'asc'],
    ];
    const result = normalizeOrder(orderWithNone);
    expect(result).toEqual([
      ['orders.count', 'desc'],
      ['orders.total', 'asc'],
    ]);
  });

  it('should return undefined when all entries have none direction', () => {
    const allNone: TQueryOrderArray = [
      ['orders.count', 'none'],
      ['orders.status', 'none'],
    ];
    const result = normalizeOrder(allNone);
    expect(result).toBeUndefined();
  });
});
