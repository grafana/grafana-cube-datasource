import { CubeQuery } from '../types';

/**
 * Describes an unsupported feature detected in a query.
 * Used to explain to users why the visual builder cannot be used.
 */
export interface UnsupportedFeature {
  /** Human-readable description of the feature */
  description: string;
  /** The specific value that triggered the detection (for debugging) */
  detail?: string;
}

/**
 * Checks if a string contains a dashboard variable reference.
 * Dashboard variables start with $ (e.g., $myVariable, ${myVariable})
 */
function containsDashboardVariable(value: string): boolean {
  return value.includes('$');
}

/**
 * Detects features in a CubeQuery that the visual query builder cannot handle.
 *
 * The visual builder supports:
 * - Simple dimensions and measures (without variables)
 * - Simple filters with equals/notEquals operators
 * - Order by fields
 * - Row limits
 *
 * The visual builder does NOT support:
 * - Time dimensions
 * - Dashboard variables in dimensions/measures
 * - Complex filter groups (AND/OR logic)
 *
 * @param query - The CubeQuery to check
 * @returns Array of unsupported features. Empty array means visual builder can be used.
 */
export function detectUnsupportedFeatures(query: CubeQuery): UnsupportedFeature[] {
  const unsupportedFeatures: UnsupportedFeature[] = [];

  // Check for time dimensions
  if (query.timeDimensions && query.timeDimensions.length > 0) {
    const dimensions = query.timeDimensions.map((td) => td.dimension).join(', ');
    unsupportedFeatures.push({
      description: 'Time dimensions',
      detail: dimensions,
    });
  }

  // Check for dashboard variables in dimensions
  if (query.dimensions) {
    for (const dimension of query.dimensions) {
      if (containsDashboardVariable(dimension)) {
        unsupportedFeatures.push({
          description: 'Dashboard variable in dimensions',
          detail: dimension,
        });
      }
    }
  }

  // Check for dashboard variables in measures
  if (query.measures) {
    for (const measure of query.measures) {
      if (containsDashboardVariable(measure)) {
        unsupportedFeatures.push({
          description: 'Dashboard variable in measures',
          detail: measure,
        });
      }
    }
  }

  // Check for complex filter groups (AND/OR logic)
  // Cube.js supports filters with 'and'/'or' keys for nested logic
  // Our CubeFilter type only supports simple filters, but someone could
  // add complex filters via dashboard JSON editing
  if (query.filters && Array.isArray(query.filters)) {
    for (const filter of query.filters) {
      // Check if filter has 'and' or 'or' property (complex filter group)
      // Cast to 'any' since these properties aren't in our CubeFilter type
      const filterAny = filter as any;
      if (filterAny.and || filterAny.or) {
        unsupportedFeatures.push({
          description: 'Complex filter groups (AND/OR logic)',
          detail: filterAny.and ? 'AND group' : 'OR group',
        });
        // Only report once even if multiple complex groups exist
        break;
      }
    }
  }

  return unsupportedFeatures;
}
