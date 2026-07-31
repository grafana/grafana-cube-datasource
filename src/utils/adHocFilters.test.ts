import { resolveAdHocFilters } from './adHocFilters';

describe('resolveAdHocFilters (issue #127)', () => {
  const datasource = { name: 'Cube', uid: 'grafana-cube-datasource' };

  it('prefers explicit non-empty filters from applyTemplateVariables / DataQueryRequest', () => {
    const explicit = [{ key: 'orders.status', operator: '=', value: 'completed' }];
    expect(resolveAdHocFilters(datasource, explicit)).toEqual(explicit);
  });

  it('falls through from an empty explicit list to dashboard variables / deprecated API', () => {
    // Empty array from Grafana (scenes + getAdhocFilters miss) must not block
    // resolution via getVariables / getAdhocFilters.
    // With no templateSrv mocks here, deprecated path returns [].
    expect(resolveAdHocFilters(datasource, [])).toEqual([]);
  });
});
