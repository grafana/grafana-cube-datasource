import { MetadataOption } from '../queries';

export const UNAVAILABLE_PREFIX = 'Unavailable';

interface ViewSelectionQuery {
  dimensions?: string[];
  measures?: string[];
  filters?: unknown[];
}

export interface ViewSelectionMetadata {
  dimensions: MetadataOption[];
  measures: MetadataOption[];
}

/**
 * Build a member (fully-qualified name) -> view (cube) map from metadata.
 * Cube view members are fully qualified (e.g. `view_a.region`), so this lets us
 * tell which view an AdHoc filter's key belongs to. See issue #307.
 */
export function buildMemberViewMap(metadata: ViewSelectionMetadata): Map<string, string> {
  const map = new Map<string, string>();
  for (const option of [...metadata.dimensions, ...metadata.measures]) {
    map.set(option.value, option.cube);
  }
  return map;
}

export interface ViewSelectionState {
  view?: string;
}

export function getViewSelectionState(
  query: ViewSelectionQuery,
  metadata: ViewSelectionMetadata
): ViewSelectionState {
  const byValue = new Map<string, MetadataOption>();
  for (const option of [...metadata.dimensions, ...metadata.measures]) {
    byValue.set(option.value, option);
  }

  const selected = [
    ...(query.dimensions ?? []),
    ...(query.measures ?? []),
    ...(query.filters ?? []).map(getFlatFilterMember).filter((member): member is string => member !== undefined),
  ];

  for (const name of selected) {
    const option = byValue.get(name);
    if (option) {
      return { view: option.cube };
    }
  }

  return {};
}

function getFlatFilterMember(filter: unknown): string | undefined {
  if (!filter || typeof filter !== 'object' || !('member' in filter)) {
    return undefined;
  }

  const member = (filter as { member?: unknown }).member;
  return typeof member === 'string' ? member : undefined;
}

export function decorateWithViewSelection<T extends MetadataOption>(
  options: T[],
  state: ViewSelectionState
): Array<T & { isDisabled?: boolean; description?: string; data?: Record<string, unknown> }> {
  if (!state.view) {
    return options;
  }

  const reason = `${UNAVAILABLE_PREFIX}: query is scoped to ${state.view}`;

  return options.map((option) => {
    if (option.cube === state.view) {
      return option;
    }

    const optionWithData = option as T & { data?: Record<string, unknown> };
    return {
      ...option,
      isDisabled: true,
      description: reason,
      data: {
        ...optionWithData.data,
        originalDescription: option.description ?? '',
      },
    };
  });
}
