import { getTemplateSrv } from '@grafana/runtime';
import { dropMatchAllFilters, isMatchAllFilter, resolveAdHocFilters } from './adHocFilters';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getTemplateSrv: jest.fn(),
}));
const mockGetTemplateSrv = getTemplateSrv as jest.Mock;

const datasource = { name: 'Cube', uid: 'grafana-cube-datasource' };
const filterA = { key: 'orders.status', operator: '=', value: 'completed' };
const filterB = { key: 'customers.segment', operator: '=', value: 'vip' };

const setTemplateSrv = (opts: { variables?: unknown[]; getAdhocFilters?: (name: string) => unknown[] }) =>
  mockGetTemplateSrv.mockReturnValue({
    getVariables: opts.variables ? () => opts.variables : undefined,
    getAdhocFilters: opts.getAdhocFilters,
  });

describe('resolveAdHocFilters (issue #127)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no variables, no deprecated filters.
    setTemplateSrv({ variables: [], getAdhocFilters: () => [] });
  });

  it('prefers an explicit non-empty filters list (applyTemplateVariables / DataQueryRequest.filters)', () => {
    setTemplateSrv({ variables: [{ type: 'adhoc', datasource: { uid: datasource.uid }, filters: [filterB] }] });
    // Explicit wins even though a variable also exists.
    expect(resolveAdHocFilters(datasource, [filterA])).toEqual([filterA]);
  });

  it('falls through an EMPTY explicit list to dashboard AdHoc variables (scenes miss recovery)', () => {
    setTemplateSrv({ variables: [{ type: 'adhoc', datasource: { uid: datasource.uid }, filters: [filterA] }] });
    expect(resolveAdHocFilters(datasource, [])).toEqual([filterA]);
  });

  it('resolves from dashboard AdHoc variables when no explicit filters are passed', () => {
    setTemplateSrv({ variables: [{ type: 'adhoc', datasource: { uid: datasource.uid }, filters: [filterA, filterB] }] });
    expect(resolveAdHocFilters(datasource)).toEqual([filterA, filterB]);
  });

  it('flat-maps filters ACROSS multiple matching AdHoc variables', () => {
    setTemplateSrv({
      variables: [
        { type: 'adhoc', datasource: { uid: datasource.uid }, filters: [filterA] },
        { type: 'adhoc', datasource: { uid: datasource.uid }, filters: [filterB] },
      ],
    });
    expect(resolveAdHocFilters(datasource)).toEqual([filterA, filterB]);
  });

  it('matches AdHoc variables by datasource name and by string ref', () => {
    setTemplateSrv({ variables: [{ type: 'adhoc', datasource: { uid: 'Cube' }, filters: [filterA] }] });
    expect(resolveAdHocFilters(datasource)).toEqual([filterA]); // uid===name accepted

    setTemplateSrv({ variables: [{ type: 'adhoc', datasource: datasource.uid, filters: [filterB] }] });
    expect(resolveAdHocFilters(datasource)).toEqual([filterB]); // string ref accepted
  });

  it('ignores AdHoc variables that target a DIFFERENT datasource', () => {
    setTemplateSrv({
      variables: [{ type: 'adhoc', datasource: { uid: 'other-ds' }, filters: [filterA] }],
      getAdhocFilters: () => [filterB],
    });
    // No variable matches THIS datasource -> fall through to deprecated API.
    expect(resolveAdHocFilters(datasource)).toEqual([filterB]);
  });

  it('returns a matching AdHoc variable with no active filters as an empty list (not deprecated fallback)', () => {
    setTemplateSrv({
      variables: [{ type: 'adhoc', datasource: { uid: datasource.uid }, filters: [] }],
      getAdhocFilters: () => [filterB], // must NOT be used
    });
    expect(resolveAdHocFilters(datasource)).toEqual([]);
  });

  it('falls back to deprecated getAdhocFilters when there are no matching AdHoc variables', () => {
    setTemplateSrv({ variables: [], getAdhocFilters: () => [filterA] });
    expect(resolveAdHocFilters(datasource)).toEqual([filterA]);
  });

  it('preserves an intentional empty explicit list (Explore filters: []) when no variables exist', () => {
    setTemplateSrv({ variables: [], getAdhocFilters: () => [filterA] });
    // Explore passes filters: [] -> honored as "no filters", not re-resolved.
    expect(resolveAdHocFilters(datasource, [])).toEqual([]);
  });

  it('falls back to deprecated getAdhocFilters when getVariables is unavailable (older Grafana)', () => {
    setTemplateSrv({ getAdhocFilters: () => [filterA] }); // no getVariables
    expect(resolveAdHocFilters(datasource)).toEqual([filterA]);
  });

  it('returns [] when nothing resolves (no explicit, no variables, no deprecated API)', () => {
    mockGetTemplateSrv.mockReturnValue({ getVariables: () => [] });
    expect(resolveAdHocFilters(datasource)).toEqual([]);
  });
});

// Since grafana/scenes#1591 a pinned filter that restricts nothing carries the All
// sentinel on the multi-value operator (`=| $__all`) rather than `=~ .*`. mapOperator
// collapses `=|` to equals, so forwarding it asks Cube for `x equals '$__all'` — no
// rows, while the pill reads "All".
describe('all-value sentinel handling (scenes#1591)', () => {
  const allValue = { key: 'orders.status', operator: '=|', value: '$__all', values: ['$__all'] };

  beforeEach(() => {
    jest.clearAllMocks();
    setTemplateSrv({ variables: [], getAdhocFilters: () => [] });
  });

  it('isMatchAllFilter recognises the one-of All sentinel', () => {
    expect(isMatchAllFilter(allValue)).toBe(true);
    // value-only shape, as the default filters editor persists it
    expect(isMatchAllFilter({ operator: '=|', value: '$__all' })).toBe(true);
  });

  it('only treats All as match-all on the one-of operator', () => {
    // "not one of" never offers All (it would read as excluding everything), so a
    // literal $__all there stays a real filter.
    expect(isMatchAllFilter({ operator: '!=|', value: '$__all', values: ['$__all'] })).toBe(false);
    expect(isMatchAllFilter({ operator: '=', value: '$__all' })).toBe(false);
  });

  it('preserves one-of filters with real values', () => {
    const multiValue = { key: 'orders.region', operator: '=|', value: 'AMER', values: ['AMER', 'EMEA'] };
    expect(isMatchAllFilter(multiValue)).toBe(false);
    expect(resolveAdHocFilters(datasource, [multiValue, allValue])).toEqual([multiValue]);
  });

  it('treats All mixed with real values as match-all, matching scenes', () => {
    // Scenes makes All exclusive in the combobox so this should not occur, but its
    // own isMatchAllFilter uses .includes() — mirror that rather than diverge.
    expect(isMatchAllFilter({ operator: '=|', value: 'AMER', values: ['AMER', '$__all'] })).toBe(true);
  });

  it('drops the sentinel from an explicit filters list', () => {
    expect(resolveAdHocFilters(datasource, [allValue, filterA])).toEqual([filterA]);
  });

  it('drops the sentinel recovered from dashboard AdHoc variables', () => {
    // The actual regression: scenes excludes the sentinel from
    // DataQueryRequest.filters, so the explicit list arrives EMPTY and the
    // variable fallback reads it straight back in.
    setTemplateSrv({
      variables: [{ type: 'adhoc', datasource: { uid: datasource.uid }, filters: [allValue, filterB] }],
    });
    expect(resolveAdHocFilters(datasource, [])).toEqual([filterB]);
  });

  it('yields no filters when every pinned filter is All', () => {
    // The reported dashboard case: five pinned filters all set to All must mean
    // "no restriction", not five filters that each match nothing.
    const pinnedAll = ['ae_l1_territory', 'ae_l3_territory', 'ae_segment', 'ae_seller_type'].map((key) => ({
      key: `sales_northern_lights.${key}`,
      operator: '=|',
      value: '$__all',
      values: ['$__all'],
    }));
    setTemplateSrv({
      variables: [{ type: 'adhoc', datasource: { uid: datasource.uid }, filters: pinnedAll }],
    });
    expect(resolveAdHocFilters(datasource, [])).toEqual([]);
  });
});

// Scenes rewrites a cleared dashboard-origin (pinned) filter to its match-all
// sentinel (`=~ .*`, displayed "All") and passes it to queries. mapOperator
// collapses =~ to equals, so forwarding it would mean `x equals '.*'` — the
// opposite of "All". It must resolve to no-filter instead (issue #530).
describe('match-all sentinel handling (issue #530)', () => {
  const matchAll = { key: 'orders.status', operator: '=~', value: '.*', values: ['.*'] };

  beforeEach(() => {
    jest.clearAllMocks();
    setTemplateSrv({ variables: [], getAdhocFilters: () => [] });
  });

  it('isMatchAllFilter recognises exactly the scenes match-all shape', () => {
    expect(isMatchAllFilter(matchAll)).toBe(true);
    expect(isMatchAllFilter({ operator: '=~', value: '.+' })).toBe(false); // real (if unsupported) regex
    expect(isMatchAllFilter({ operator: '=', value: '.*' })).toBe(false); // literal equals '.*'
    expect(isMatchAllFilter({ operator: '!~', value: '.*' })).toBe(false); // not the clear-state shape
  });

  it('dropMatchAllFilters removes only match-all sentinels', () => {
    expect(dropMatchAllFilters([matchAll, filterA])).toEqual([filterA]);
  });

  it('preserves =~ filters with real values (pre-existing equals-workaround behaviour is unchanged)', () => {
    // `Territory =~ AMER` keeps filtering to AMER: mapOperator still turns it
    // into equals 'AMER'. Only the machine-generated `.*` sentinel is dropped.
    const regexish = { key: 'orders.region', operator: '=~', value: 'AMER' };
    expect(resolveAdHocFilters(datasource, [regexish, matchAll])).toEqual([regexish]);
  });

  it('drops match-all sentinels from an explicit filters list', () => {
    expect(resolveAdHocFilters(datasource, [matchAll, filterA])).toEqual([filterA]);
  });

  it('treats an explicit list of ONLY match-all sentinels as an intentional empty selection (no fallback)', () => {
    // A cleared pinned filter must mean "no restriction", not "re-resolve from
    // other sources".
    setTemplateSrv({ variables: [], getAdhocFilters: () => [filterB] });
    expect(resolveAdHocFilters(datasource, [matchAll])).toEqual([]);
  });

  it('drops match-all sentinels resolved from dashboard AdHoc variables', () => {
    setTemplateSrv({
      variables: [{ type: 'adhoc', datasource: { uid: datasource.uid }, filters: [matchAll, filterB] }],
    });
    expect(resolveAdHocFilters(datasource)).toEqual([filterB]);
  });
});
