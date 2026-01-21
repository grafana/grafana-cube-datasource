import { CubeFilter, Operator } from '../types';

/**
 * Checks if a Cube filter is valid and can be sent to the Cube API.
 *
 * Different operators have different validity requirements:
 * - equals, notEquals: require non-empty values array
 * - set, notSet: don't require values (null checks) - not yet implemented
 * - contains, startsWith, endsWith: require values - not yet implemented
 * - gt, gte, lt, lte: require a single value - not yet implemented
 * - inDateRange, beforeDate, afterDate: require date values - not yet implemented
 *
 * This function should be extended as new operators are added.
 */
export function isValidCubeFilter(filter: CubeFilter): boolean {
  // Must have a member
  if (!filter.member) {
    return false;
  }

  // Currently only equals and notEquals are implemented, both require non-empty values
  if (filter.operator === Operator.Equals || filter.operator === Operator.NotEquals) {
    return filter.values.length > 0;
  }

  // Other operators have not been implemented yet
  return false;
}

/**
 * Filters out invalid filters from an array.
 * Use this before sending filters to the Cube API.
 */
export function filterValidCubeFilters(filters: CubeFilter[]): CubeFilter[] {
  return filters.filter(isValidCubeFilter);
}
