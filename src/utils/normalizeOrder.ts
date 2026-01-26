import type { TQueryOrderArray, TQueryOrderObject } from '@cubejs-client/core';
import { Order } from '../types';

/**
 * Internal order array type using our Order type ('asc' | 'desc').
 * This is a subset of Cube's TQueryOrderArray that excludes 'none'.
 */
export type OrderArray = Array<[string, Order]>;

/**
 * Legacy object format from old saved queries: { "field": "asc" | "desc" }
 *
 * Deprecated because JavaScript object key order isn't guaranteed, but we need
 * deterministic ordering for the list of order-by entries. Use array format instead.
 */
export type OrderRecord = Record<string, Order>;

/**
 * Input type for normalizeOrder - accepts Cube's official types (which may include 'none').
 *
 * Our internal types (OrderArray, OrderRecord) are subtypes of Cube's types
 * (TQueryOrderArray, TQueryOrderObject), so TypeScript accepts them automatically.
 */
export type OrderInput = TQueryOrderArray | TQueryOrderObject | undefined;

/**
 * Type guard to check if a direction is a valid Order ('asc' | 'desc').
 * Filters out 'none' which is valid in Cube but meaningless for sorting.
 */
function isValidOrder(direction: string): direction is Order {
  return direction === 'asc' || direction === 'desc';
}

/**
 * Normalizes order input to our internal OrderArray format.
 *
 * Handles two concerns:
 * 1. Format conversion: legacy object format → array format
 * 2. Direction filtering: removes 'none' entries (meaningless for sorting)
 *
 * Legacy format: { "orders.count": "desc" }
 * Current format: [["orders.count", "desc"]]
 *
 * Returns OrderArray or undefined if no valid entries remain.
 */
export function normalizeOrder(order: OrderInput): OrderArray | undefined {
  if (!order) {
    return undefined;
  }

  let entries: Array<[string, string]>;

  if (Array.isArray(order)) {
    entries = order;
  } else {
    // Convert object to array of tuples
    entries = Object.entries(order);
  }

  // Filter out 'none' entries - they have no effect on sorting
  const validEntries = entries.filter(([, direction]) => isValidOrder(direction)) as OrderArray;

  return validEntries.length > 0 ? validEntries : undefined;
}
