import { MetadataOption } from '../queries';
import { decorateWithViewSelection, getViewSelectionState, ONE_VIEW_PER_QUERY_REASON } from './viewSelection';

const opt = (value: string, view = value.split('.')[0], extra: Partial<MetadataOption> = {}): MetadataOption => ({
  label: value,
  value,
  type: 'string',
  cube: view,
  ...extra,
});

describe('getViewSelectionState', () => {
  const metadata = {
    dimensions: [opt('orders.status'), opt('marketing_events.channel')],
    measures: [opt('orders.count'), opt('marketing_events.count')],
  };

  it('returns empty state when no fields are selected', () => {
    expect(getViewSelectionState({}, metadata).view).toBeUndefined();
  });

  it('returns the selected view for selected dimensions and measures', () => {
    const state = getViewSelectionState({ dimensions: ['orders.status'], measures: ['orders.count'] }, metadata);
    expect(state.view).toBe('orders');
  });

  it('returns the selected view for selected flat filters', () => {
    const state = getViewSelectionState({ filters: [{ member: 'marketing_events.channel' }] }, metadata);
    expect(state.view).toBe('marketing_events');
  });

  it('ignores non-flat filter groups when deriving the selected view', () => {
    const state = getViewSelectionState({ filters: [{ or: [{ member: 'orders.status' }] }] }, metadata);
    expect(state.view).toBeUndefined();
  });

  it('uses the first selected view when saved queries already span multiple views', () => {
    const state = getViewSelectionState(
      { dimensions: ['orders.status'], measures: ['marketing_events.count'] },
      metadata
    );
    expect(state.view).toBe('orders');
  });

  it('ignores selected names that are no longer in metadata', () => {
    const state = getViewSelectionState({ dimensions: ['deleted.field'], measures: ['orders.count'] }, metadata);
    expect(state.view).toBe('orders');
  });
});

describe('decorateWithViewSelection', () => {
  const options: MetadataOption[] = [
    opt('orders.status', 'orders', { description: 'order status' }),
    opt('orders.customer', 'orders'),
    opt('marketing_events.channel', 'marketing_events'),
  ];

  it('returns options unchanged when nothing is selected', () => {
    const decorated = decorateWithViewSelection(options, {});
    expect(decorated).toBe(options);
  });

  it('disables options outside the selected view and preserves selected-view options', () => {
    const decorated = decorateWithViewSelection(options, { view: 'orders' });

    const status = decorated.find((o) => o.value === 'orders.status');
    expect(status?.isDisabled).toBeUndefined();
    expect(status?.description).toBe('order status');

    const customer = decorated.find((o) => o.value === 'orders.customer');
    expect(customer?.isDisabled).toBeUndefined();

    const channel = decorated.find((o) => o.value === 'marketing_events.channel');
    expect(channel?.isDisabled).toBe(true);
    expect(channel?.description).toBe(`${ONE_VIEW_PER_QUERY_REASON}: currently using orders`);
  });

  it('appends the reason to existing descriptions instead of overwriting', () => {
    const [decorated] = decorateWithViewSelection(
      [opt('marketing_events.channel', 'marketing_events', { description: 'attribution channel' })],
      { view: 'orders' }
    );

    expect(decorated.isDisabled).toBe(true);
    expect(decorated.description).toBe(
      `attribution channel — ${ONE_VIEW_PER_QUERY_REASON}: currently using orders`
    );
  });

  it('preserves the original description in option data for disabled options', () => {
    const optsWithData = [
      {
        ...opt('marketing_events.channel', 'marketing_events', {
          description: 'attribution channel',
        }),
        data: { existing: true },
      },
    ];
    const [decorated] = decorateWithViewSelection(optsWithData, { view: 'orders' });

    expect(decorated.data).toEqual({
      existing: true,
      originalDescription: 'attribution channel',
    });
  });
});
