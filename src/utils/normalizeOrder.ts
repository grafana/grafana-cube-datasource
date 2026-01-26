import { Order } from '../types';
import type { Query as CubeQuery } from '@cubejs-client/core';

export type OrderArray = Array<[string, Order]>;
export type OrderRecord = Record<string, Order>;
export type OrderInput = OrderArray | OrderRecord | undefined;

/**
 * Normalizes order from either object format (legacy) or array format (new) to array format.
 * This provides backward compatibility for saved queries that use the old object format.
 *
 * Legacy format: { "orders.count": "desc" }
 * New format: [["orders.count", "desc"]]
 */
export function normalizeOrder(order: OrderInput): CubeQuery['order'] | undefined {
  if (!order) {
    return undefined;
  }

  // Already an array - return as-is
  if (Array.isArray(order)) {
    return order;
  }

  // Convert object to array of tuples
  return Object.entries(order) as OrderArray;
}
