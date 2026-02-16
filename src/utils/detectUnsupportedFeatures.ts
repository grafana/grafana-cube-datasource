import { CubeFilterItem, CubeQuery, CubeFilter, VISUAL_BUILDER_OPERATORS, isCubeFilter, isCubeAndFilter, isCubeOrFilter } from '../types';

// Matches Grafana template variables: $var, ${var}, ${var:format}, [[var]], [[var:format]]
const TEMPLATE_VARIABLE_PATTERN = /(?:\$(?:[a-zA-Z_]\w*|\{[a-zA-Z_]\w*(?::\w+)?\})|\[\[[^\]]+\]\])/;

/**
 * Result of detecting unsupported features in a query.
 * Contains both human-readable reasons and the set of affected keys.
 */
export interface UnsupportedFeaturesResult {
  /** Human-readable descriptions of unsupported features */
  reasons: string[];
  /** Top-level CubeQuery keys that contain unsupported features */
  keys: Set<string>;
}

/**
 * Core detection logic for unsupported query features.
 * Returns both human-readable reasons and affected keys in a single pass.
 */
function detectUnsupportedFeaturesCore(query: CubeQuery): UnsupportedFeaturesResult {
  const reasons: string[] = [];
  const keys = new Set<string>();

  if (query.timeDimensions && query.timeDimensions.length > 0) {
    reasons.push('Time dimensions are not yet supported in the visual editor');
    keys.add('timeDimensions');
  }

  if (query.filters?.length) {
    let filtersHaveIssues = false;

    // Check for AND/OR logical filter groups
    const hasLogicalGroups = query.filters.some(
      (f) => isCubeAndFilter(f) || isCubeOrFilter(f)
    );
    if (hasLogicalGroups) {
      reasons.push('AND/OR filter groups are not yet supported in the visual editor');
      filtersHaveIssues = true;
    }

    // Check for filter operators beyond equals/notEquals (in flat filters only;
    // nested filters inside groups are covered by the logical groups check above)
    const advancedOperators = collectAdvancedOperators(query.filters);
    if (advancedOperators.length > 0) {
      reasons.push(`Filter operators not yet supported in the visual editor: ${advancedOperators.join(', ')}`);
      filtersHaveIssues = true;
    }

    if (hasTemplateVariableInFilterValues(query.filters)) {
      reasons.push('Filter values containing dashboard variables are not yet supported in the visual editor');
      filtersHaveIssues = true;
    }

    if (filtersHaveIssues) {
      keys.add('filters');
    }
  }

  return { reasons, keys };
}

/**
 * Detects query features that the visual builder cannot represent.
 *
 * Uses a blocklist approach: we check for specific patterns we know are
 * unsupported and return human-readable descriptions for each.
 * Everything else is assumed to be supported by the visual editor.
 *
 * Returns an empty array when the query can be fully represented in
 * the visual builder.
 */
export function detectUnsupportedFeatures(query: CubeQuery): string[] {
  return detectUnsupportedFeaturesCore(query).reasons;
}

/**
 * Returns the set of top-level CubeQuery keys that contain unsupported features.
 *
 * Used by the UnsupportedFieldsViewer to extract and display only the
 * query fields that the visual builder cannot represent.
 */
export function getUnsupportedQueryKeys(query: CubeQuery): Set<string> {
  return detectUnsupportedFeaturesCore(query).keys;
}

/**
 * Extracts filters that the visual builder cannot represent.
 * These include:
 * - AND/OR logical filter groups
 * - Filters with operators other than equals/notEquals
 * - Filters with template variables in values
 *
 * Used to preserve unsupported filters when the visual editor modifies
 * the supported subset.
 */
export function extractUnsupportedFilters(filters: CubeFilterItem[] | undefined): CubeFilterItem[] {
  if (!filters?.length) {
    return [];
  }

  return filters.filter((f) => {
    // AND/OR groups are unsupported
    if (isCubeAndFilter(f) || isCubeOrFilter(f)) {
      return true;
    }
    // Non-visual-builder operators are unsupported
    if (isCubeFilter(f) && !VISUAL_BUILDER_OPERATORS.has(f.operator)) {
      return true;
    }
    // Template variables in values are unsupported
    if (isCubeFilter(f) && f.values?.some((v) => TEMPLATE_VARIABLE_PATTERN.test(v))) {
      return true;
    }
    return false;
  });
}

/**
 * Extracts filters that the visual builder can represent (equals/notEquals
 * without template variables).
 */
export function extractVisualBuilderFilters(filters: CubeFilterItem[] | undefined): CubeFilter[] {
  if (!filters?.length) {
    return [];
  }

  return filters.filter((f): f is CubeFilter => {
    if (!isCubeFilter(f)) {
      return false;
    }
    if (!VISUAL_BUILDER_OPERATORS.has(f.operator)) {
      return false;
    }
    if (f.values?.some((v) => TEMPLATE_VARIABLE_PATTERN.test(v))) {
      return false;
    }
    return true;
  });
}

/**
 * Recursively collects advanced (non-visual-builder) operators from filters,
 * returning a de-duplicated list of operator names.
 */
function collectAdvancedOperators(filters: CubeFilterItem[]): string[] {
  const operators = new Set<string>();

  for (const item of filters) {
    if (isCubeFilter(item)) {
      if (!VISUAL_BUILDER_OPERATORS.has(item.operator)) {
        operators.add(item.operator);
      }
    } else if (isCubeAndFilter(item)) {
      for (const op of collectAdvancedOperators(item.and)) {
        operators.add(op);
      }
    } else if (isCubeOrFilter(item)) {
      for (const op of collectAdvancedOperators(item.or)) {
        operators.add(op);
      }
    }
  }

  return [...operators];
}

/**
 * Recursively checks whether any filter value contains a Grafana
 * template variable (e.g. $var, ${var}, or [[var]]).
 */
function hasTemplateVariableInFilterValues(filters: CubeFilterItem[]): boolean {
  for (const item of filters) {
    if (isCubeFilter(item)) {
      if (item.values?.some((v) => TEMPLATE_VARIABLE_PATTERN.test(v))) {
        return true;
      }
    } else if (isCubeAndFilter(item)) {
      if (hasTemplateVariableInFilterValues(item.and)) {
        return true;
      }
    } else if (isCubeOrFilter(item)) {
      if (hasTemplateVariableInFilterValues(item.or)) {
        return true;
      }
    }
  }
  return false;
}
