import { CubeQuery, VISUAL_BUILDER_OPERATORS } from '../types';

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

  // Check for filter operators beyond equals/notEquals
  if (query.filters?.length) {
    const advancedOperators = query.filters
      .filter((f) => !VISUAL_BUILDER_OPERATORS.has(f.operator))
      .map((f) => f.operator);

    if (advancedOperators.length > 0) {
      const unique = [...new Set(advancedOperators)];
      issues.push(`Filter operators not yet supported in the visual editor: ${unique.join(', ')}`);
    }
  }

  // Check for filters on measures (visual builder only supports dimension filters)
  if (query.filters?.length && query.measures?.length) {
    const measureSet = new Set(query.measures);
    const measureFilters = query.filters.filter((f) => measureSet.has(f.member));
    if (measureFilters.length > 0) {
      issues.push('Filters on measures are not yet supported in the visual editor');
    }
  }

  return issues;
}
