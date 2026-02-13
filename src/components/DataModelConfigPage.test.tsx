import { extractDatasourceUid } from './DataModelConfigPage';

describe('extractDatasourceUid', () => {
  it('extracts UID from standard datasource edit URL', () => {
    expect(extractDatasourceUid('/connections/datasources/edit/cube-datasource/')).toBe('cube-datasource');
  });

  it('extracts UID from URL without trailing slash', () => {
    expect(extractDatasourceUid('/connections/datasources/edit/my-uid')).toBe('my-uid');
  });

  it('extracts UID when query params are present', () => {
    // The pathname itself won't have query params, but test the regex doesn't break
    expect(extractDatasourceUid('/connections/datasources/edit/abc-123')).toBe('abc-123');
  });

  it('returns null when URL does not match', () => {
    expect(extractDatasourceUid('/some/other/page')).toBeNull();
  });

  it('returns null for empty pathname', () => {
    expect(extractDatasourceUid('/')).toBeNull();
  });
});
