import { normalizeOrder, OrderArray, OrderRecord } from './normalizeOrder';

describe('normalizeOrder', () => {
  it('should return undefined for undefined input', () => {
    expect(normalizeOrder(undefined)).toBeUndefined();
  });

  it('should return array format as-is', () => {
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

  it('should handle empty object', () => {
    const result = normalizeOrder({});
    expect(result).toEqual([]);
  });

  it('should handle empty array', () => {
    const result = normalizeOrder([]);
    expect(result).toEqual([]);
  });
});
