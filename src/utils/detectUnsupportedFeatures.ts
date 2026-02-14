import { CubeQuery } from '../types';

/**
 * Block-list detector for features the visual query builder does not support yet.
 * Future unsupported feature checks should be added here.
 */
export function detectUnsupportedFeatures(query: CubeQuery): string[] {
  const unsupportedFeatures: string[] = [];

  if (query.timeDimensions?.length) {
    unsupportedFeatures.push('Time dimensions are not supported in the visual query builder.');
  }

  return unsupportedFeatures;
}
