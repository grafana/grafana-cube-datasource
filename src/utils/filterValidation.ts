import { CubeFilter, UNARY_OPERATORS, ALL_OPERATORS } from '../types';

/**
 * Checks if a Cube filter is valid and can be sent to the Cube API.
 *
 * - Must have a member and a known Cube operator.
 * - Unary operators (set, notSet): only require a member (null checks).
 * - Binary operators (all others): require a member and non-empty values array.
 */
export function isValidCubeFilter(filter: CubeFilter): boolean {
  // Must have a member
  if (!filter.member) {
    return false;
  }

  // Must be a known Cube operator (runtime check for user-editable JSON)
  if (!ALL_OPERATORS.has(filter.operator)) {
    return false;
  }

  // Unary operators (set, notSet) don't require values
  if (UNARY_OPERATORS.has(filter.operator)) {
    return true;
  }

  // All binary operators require non-empty values
  return Array.isArray(filter.values) && filter.values.length > 0;
}

/**
 * Filters out invalid filters from an array.
 * Use this before sending filters to the Cube API.
 */
export function filterValidCubeFilters(filters: CubeFilter[]): CubeFilter[] {
  return filters.filter(isValidCubeFilter);
}
