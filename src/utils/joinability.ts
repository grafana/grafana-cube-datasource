import { MetadataOption } from '../queries';

/**
 * Description prefix for options the user cannot pick because they belong to
 * a different connected component than what's already selected. Cube's join
 * graph guarantees that fields from different connected components cannot be
 * queried together, so we surface this in the picker rather than letting the
 * request fail at execution time. The selected cube name(s) are appended to
 * make the explanation concrete: "Not joinable with: orders".
 */
export const NOT_JOINABLE_PREFIX = 'Not joinable with';

interface JoinabilityQuery {
  dimensions?: string[];
  measures?: string[];
}

interface JoinabilityMetadata {
  dimensions: MetadataOption[];
  measures: MetadataOption[];
}

/**
 * Joinability state derived from the current query: which connected
 * components the user has selected from, and which cube/view names produced
 * those selections (used for the human-readable tooltip).
 */
export interface JoinabilityState {
  components: Set<number>;
  cubes: Set<string>;
}

/**
 * Inspects the user's current selection and returns the join-graph context
 * needed to decorate the option lists. An empty state (no selections, or
 * all selections refer to fields that no longer exist in metadata) means
 * nothing should be disabled.
 *
 * Stale selections are skipped silently: metadata is the source of truth for
 * joinability, so a saved query referencing a removed field should not
 * constrain the picker.
 */
export function getJoinabilityState(
  query: JoinabilityQuery,
  metadata: JoinabilityMetadata
): JoinabilityState {
  const components = new Set<number>();
  const cubes = new Set<string>();
  const byValue = new Map<string, MetadataOption>();
  for (const option of [...metadata.dimensions, ...metadata.measures]) {
    byValue.set(option.value, option);
  }

  const selected = [...(query.dimensions ?? []), ...(query.measures ?? [])];
  for (const name of selected) {
    const option = byValue.get(name);
    if (option) {
      components.add(option.connectedComponent);
      cubes.add(option.cube);
    }
  }
  return { components, cubes };
}

/**
 * Returns a copy of the given options where any option whose
 * `connectedComponent` is not in `state.components` is marked `isDisabled`
 * and has a not-joinable description appended (or replaces an empty one)
 * so users see *why* the option is greyed out, including the cube name(s)
 * already selected.
 *
 * If the state is empty (nothing selected yet) the options are returned
 * unchanged. Already-disabled options are left untouched - we only ever add
 * disability, never remove it.
 */
export function decorateWithJoinability<T extends MetadataOption>(
  options: T[],
  state: JoinabilityState
): Array<T & { isDisabled?: boolean; description?: string }> {
  if (state.components.size === 0) {
    return options;
  }

  // Sorted for stable, predictable output regardless of iteration order.
  const cubeList = [...state.cubes].sort().join(', ');
  const reason = cubeList ? `${NOT_JOINABLE_PREFIX}: ${cubeList}` : `${NOT_JOINABLE_PREFIX} current selection`;

  return options.map((option) => {
    if (state.components.has(option.connectedComponent)) {
      return option;
    }
    const description = option.description ? `${option.description} — ${reason}` : reason;
    return {
      ...option,
      isDisabled: true,
      description,
    };
  });
}
