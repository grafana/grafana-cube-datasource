import { CubeFilter, CubeFilterItem, isCubeFilter, isCubeAndFilter, isCubeOrFilter, UNARY_OPERATORS } from '../types';

/**
 * Checks if a flat Cube filter is valid and can be sent to the Cube API.
 *
 * - Unary operators (set, notSet): only require a member (null checks).
 * - Binary operators (all others): require a member and non-empty values array.
 */
export function isValidCubeFilter(filter: CubeFilter): boolean {
  // Must have a member
  if (!filter.member) {
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
 * Recursively validates a filter item (flat filter or logical group).
 *
 * - Flat filters are validated with isValidCubeFilter.
 * - AND/OR groups are valid if they contain at least one valid child.
 *   Invalid children within a group are removed.
 *
 * Returns the validated filter item, or null if it's entirely invalid.
 */
export function validateFilterItem(item: CubeFilterItem): CubeFilterItem | null {
  if (isCubeFilter(item)) {
    return isValidCubeFilter(item) ? item : null;
  }

  if (isCubeAndFilter(item)) {
    const validChildren = item.and
      .map(validateFilterItem)
      .filter((child): child is CubeFilterItem => child !== null);
    return validChildren.length > 0 ? { and: validChildren } : null;
  }

  if (isCubeOrFilter(item)) {
    const validChildren = item.or
      .map(validateFilterItem)
      .filter((child): child is CubeFilterItem => child !== null);
    return validChildren.length > 0 ? { or: validChildren } : null;
  }

  return null;
}

/**
 * Filters out invalid filters from an array.
 * Handles both flat filters and logical AND/OR groups.
 * Use this before sending filters to the Cube API.
 */
export function filterValidCubeFilters(filters: CubeFilterItem[]): CubeFilterItem[] {
  return filters
    .map(validateFilterItem)
    .filter((item): item is CubeFilterItem => item !== null);
}
