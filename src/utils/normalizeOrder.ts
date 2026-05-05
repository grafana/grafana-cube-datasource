import type { TQueryOrderArray } from '@cubejs-client/core';
import { Order } from '../types';

/**
 * Internal order array type using our Order type ('asc' | 'desc').
 * This is a subset of Cube's TQueryOrderArray that excludes 'none'.
 */
export type OrderArray = Array<[string, Order]>;

/**
 * Type guard to check if a direction is a valid Order ('asc' | 'desc').
 * Filters out 'none' which is valid in Cube but meaningless for sorting.
 */
function isValidOrder(direction: string): direction is Order {
  return direction === 'asc' || direction === 'desc';
}

/**
 * Normalizes order input to our internal OrderArray format.
 * Filters out 'none' entries (valid in Cube but meaningless for sorting).
 * Returns OrderArray or undefined if no valid entries remain.
 */
export function normalizeOrder(order: TQueryOrderArray | undefined): OrderArray | undefined {
  if (!order || order.length === 0) {
    return undefined;
  }

  const validEntries = order.filter(([, direction]) => isValidOrder(direction)) as OrderArray;
  return validEntries.length > 0 ? validEntries : undefined;
}
