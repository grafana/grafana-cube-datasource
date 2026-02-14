import { CubeQuery } from '../types';

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

  return issues;
}
