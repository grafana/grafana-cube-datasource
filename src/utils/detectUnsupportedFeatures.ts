import { CubeFilterItem, CubeQuery, VISUAL_BUILDER_OPERATORS, isCubeFilter, isCubeAndFilter, isCubeOrFilter } from '../types';

const TEMPLATE_VARIABLE_PATTERN = /(?:\$(?:[a-zA-Z_]\w*|\{[a-zA-Z_]\w*\})|\[\[[^\]]+\]\])/;

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
  const issues: string[] = [];

  if (query.timeDimensions && query.timeDimensions.length > 0) {
    issues.push('Time dimensions are not yet supported in the visual editor');
  }

  if (query.filters?.length) {
    // Check for AND/OR logical filter groups
    const hasLogicalGroups = query.filters.some(
      (f) => isCubeAndFilter(f) || isCubeOrFilter(f)
    );
    if (hasLogicalGroups) {
      issues.push('AND/OR filter groups are not yet supported in the visual editor');
    }

    // Check for filter operators beyond equals/notEquals (in flat filters only;
    // nested filters inside groups are covered by the logical groups check above)
    const advancedOperators = collectAdvancedOperators(query.filters);
    if (advancedOperators.length > 0) {
      issues.push(`Filter operators not yet supported in the visual editor: ${advancedOperators.join(', ')}`);
    }

    if (hasTemplateVariableInFilterValues(query.filters)) {
      issues.push('Filter values containing dashboard variables are not yet supported in the visual editor');
    }
  }

  return issues;
}

/**
 * Returns the set of top-level CubeQuery keys that contain unsupported features.
 *
 * Used by the UnsupportedFieldsViewer to extract and display only the
 * query fields that the visual builder cannot represent.
 */
export function getUnsupportedQueryKeys(query: CubeQuery): Set<string> {
  const keys = new Set<string>();

  if (query.timeDimensions && query.timeDimensions.length > 0) {
    keys.add('timeDimensions');
  }

  if (query.filters?.length) {
    const hasLogicalGroups = query.filters.some(
      (f) => isCubeAndFilter(f) || isCubeOrFilter(f)
    );
    const advancedOperators = collectAdvancedOperators(query.filters);

    if (hasLogicalGroups || advancedOperators.length > 0 || hasTemplateVariableInFilterValues(query.filters)) {
      keys.add('filters');
    }
  }

  return keys;
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
