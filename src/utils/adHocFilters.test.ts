import { getTemplateSrv } from '@grafana/runtime';
import { resolveAdHocFilters } from './adHocFilters';

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
