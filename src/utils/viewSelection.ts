import { MetadataOption } from '../queries';

export const ONE_VIEW_PER_QUERY_REASON = 'Select fields from one view per query';

interface ViewSelectionQuery {
  dimensions?: string[];
  measures?: string[];
  filters?: unknown[];
}

interface ViewSelectionMetadata {
  dimensions: MetadataOption[];
  measures: MetadataOption[];
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

  const reason = `${ONE_VIEW_PER_QUERY_REASON}: currently using ${state.view}`;

  return options.map((option) => {
    if (option.cube === state.view) {
      return option;
    }

    const optionWithData = option as T & { data?: Record<string, unknown> };
    return {
      ...option,
      isDisabled: true,
      description: option.description ? `${option.description} — ${reason}` : reason,
      data: {
        ...optionWithData.data,
        originalDescription: option.description,
      },
    };
  });
}
