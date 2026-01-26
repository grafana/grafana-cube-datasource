import type { TQueryOrderArray, TQueryOrderObject } from '@cubejs-client/core';
import { Order } from '../types';

/**
 * Legacy type alias kept for backward compatibility with existing code.
 * Prefer using Cube's TQueryOrderArray directly for new code.
 */
export type OrderArray = Array<[string, Order]>;
export type OrderRecord = Record<string, Order>;

/**
 * Input type for normalizeOrder - accepts both Cube's official types
 * and our legacy internal types.
 */
export type OrderInput = TQueryOrderArray | TQueryOrderObject | OrderArray | OrderRecord | undefined;

/**
 * Normalizes order from either object format (legacy) or array format (new) to Cube's
 * expected array order format. This provides backward compatibility for saved queries
 * that use the old object format.
 *
 * Legacy format: { "orders.count": "desc" }
 * New format: [["orders.count", "desc"]]
 *
 * Returns `TQueryOrderArray` from `@cubejs-client/core` to ensure type compatibility
 * with Cube's official API. This is the array format variant of `Query['order']`.
 */
export function normalizeOrder(order: OrderInput): TQueryOrderArray | undefined {
  if (!order) {
    return undefined;
  }

  // Already an array - return as-is
  if (Array.isArray(order)) {
    return order;
  }

  // Convert object to array of tuples
  return Object.entries(order) as TQueryOrderArray;
}
