import { MetadataOption } from '../queries';
import { decorateWithJoinability, getJoinabilityState, NOT_JOINABLE_PREFIX } from './joinability';

const opt = (value: string, connectedComponent: number, extra: Partial<MetadataOption> = {}): MetadataOption => ({
  label: value,
  value,
  type: 'string',
  cube: value.split('.')[0],
  connectedComponent,
  ...extra,
});

describe('getJoinabilityState', () => {
  const metadata = {
    dimensions: [opt('orders.status', 1), opt('marketing_events.channel', 2)],
    measures: [opt('orders.count', 1), opt('marketing_events.count', 2)],
  };

  it('returns empty state when no fields are selected', () => {
    const state = getJoinabilityState({}, metadata);
    expect(state.components.size).toBe(0);
    expect(state.cubes.size).toBe(0);
  });

  it('returns the components and cubes for selected dimensions and measures', () => {
    const state = getJoinabilityState(
      { dimensions: ['orders.status'], measures: ['orders.count'] },
      metadata
    );
    expect([...state.components]).toEqual([1]);
    expect([...state.cubes]).toEqual(['orders']);
  });

  it('combines components and cubes across compatible selections', () => {
    const state = getJoinabilityState(
      { dimensions: ['orders.status'], measures: ['marketing_events.count'] },
      metadata
    );
    expect([...state.components].sort()).toEqual([1, 2]);
    expect([...state.cubes].sort()).toEqual(['marketing_events', 'orders']);
  });

  it('ignores selected names that are no longer in metadata', () => {
    const state = getJoinabilityState(
      { dimensions: ['orders.status', 'deleted.field'] },
      metadata
    );
    expect([...state.components]).toEqual([1]);
    expect([...state.cubes]).toEqual(['orders']);
  });
});

describe('decorateWithJoinability', () => {
  const options: MetadataOption[] = [
    opt('orders.status', 1, { description: 'order status' }),
    opt('orders.customer', 1),
    opt('marketing_events.channel', 2),
  ];

  it('returns options unchanged when nothing is selected', () => {
    const decorated = decorateWithJoinability(options, { components: new Set(), cubes: new Set() });
    expect(decorated).toBe(options);
  });

  it('disables options outside the used components and preserves joinable ones', () => {
    const state = { components: new Set([1]), cubes: new Set(['orders']) };
    const decorated = decorateWithJoinability(options, state);

    const status = decorated.find((o) => o.value === 'orders.status');
    expect(status?.isDisabled).toBeUndefined();
    expect(status?.description).toBe('order status');

    const customer = decorated.find((o) => o.value === 'orders.customer');
    expect(customer?.isDisabled).toBeUndefined();

    const channel = decorated.find((o) => o.value === 'marketing_events.channel');
    expect(channel?.isDisabled).toBe(true);
    expect(channel?.description).toBe(`${NOT_JOINABLE_PREFIX}: orders`);
  });

  it('lists multiple selected cubes alphabetically in the reason', () => {
    // Imagine two cubes that happen to be in the same connected component
    // (e.g. via a shared join). Both cube names should appear in the
    // disabled-option tooltip so the user knows the full context.
    const compatibleOptions: MetadataOption[] = [
      opt('orders.status', 1),
      opt('users.email', 1, { cube: 'users' }),
      opt('marketing_events.channel', 2),
    ];
    const state = { components: new Set([1]), cubes: new Set(['orders', 'users']) };
    const [, , channel] = decorateWithJoinability(compatibleOptions, state);

    expect(channel.isDisabled).toBe(true);
    expect(channel.description).toBe(`${NOT_JOINABLE_PREFIX}: orders, users`);
  });

  it('appends the reason to existing descriptions instead of overwriting', () => {
    const optsWithDesc = [opt('marketing_events.channel', 2, { description: 'attribution channel' })];
    const state = { components: new Set([1]), cubes: new Set(['orders']) };
    const [decorated] = decorateWithJoinability(optsWithDesc, state);

    expect(decorated.isDisabled).toBe(true);
    expect(decorated.description).toBe(`attribution channel — ${NOT_JOINABLE_PREFIX}: orders`);
  });

  it('does not disable options when their component is in the used set', () => {
    const state = { components: new Set([1, 2]), cubes: new Set(['orders', 'marketing_events']) };
    const decorated = decorateWithJoinability(options, state);
    expect(decorated.every((o) => !o.isDisabled)).toBe(true);
  });

  it('falls back to a generic reason when no cubes are known (defensive)', () => {
    // Should never happen in practice (we always derive cubes alongside
    // components) but guarantees the message stays readable.
    const state = { components: new Set([1]), cubes: new Set<string>() };
    const decorated = decorateWithJoinability(options, state);
    const channel = decorated.find((o) => o.value === 'marketing_events.channel');
    expect(channel?.description).toBe(`${NOT_JOINABLE_PREFIX} current selection`);
  });
});
