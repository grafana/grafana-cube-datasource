jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: jest.fn(),
  DataSourceWithBackend: jest.fn().mockImplementation(() => ({})),
  getTemplateSrv: jest.fn(() => ({ replace: jest.fn((v: string) => v), getAdhocFilters: jest.fn(() => []) })),
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBackendSrv } from '@grafana/runtime';
import { useDbSchemaQuery, useModelFilesQuery, useGenerateSchemaMutation } from './queries';

const mockGetBackendSrv = getBackendSrv as jest.Mock;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('useDbSchemaQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches db schema from the correct URL', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      tablesSchema: {
        public: { users: [{ name: 'id', type: 'integer', attributes: [] }] },
      },
    });
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    const { result } = renderHook(() => useDbSchemaQuery('my-ds-uid'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/api/datasources/uid/my-ds-uid/resources/db-schema');
    expect(result.current.data?.tablesSchema.public.users).toHaveLength(1);
  });

  it('does not fetch when datasourceUid is empty', () => {
    const mockGet = jest.fn();
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    renderHook(() => useDbSchemaQuery(''), { wrapper: createWrapper() });

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('surfaces errors from the API', async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error('Auth failed'));
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    const { result } = renderHook(() => useDbSchemaQuery('bad-uid'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useModelFilesQuery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches model files from the correct URL', async () => {
    const mockFiles = { files: [{ fileName: 'cubes/orders.yml', content: 'cubes:\n  - name: orders' }] };
    const mockGet = jest.fn().mockResolvedValue(mockFiles);
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    const { result } = renderHook(() => useModelFilesQuery('ds-uid'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/api/datasources/uid/ds-uid/resources/model-files');
    expect(result.current.data?.files).toHaveLength(1);
  });

  it('does not fetch when datasourceUid is empty', () => {
    const mockGet = jest.fn();
    mockGetBackendSrv.mockReturnValue({ get: mockGet });

    renderHook(() => useModelFilesQuery(''), { wrapper: createWrapper() });

    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('useGenerateSchemaMutation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('posts to generate-schema endpoint with the correct body', async () => {
    const mockPost = jest.fn().mockResolvedValue({});
    const mockGet = jest.fn();
    mockGetBackendSrv.mockReturnValue({ post: mockPost, get: mockGet });

    const { result } = renderHook(() => useGenerateSchemaMutation('ds-uid'), { wrapper: createWrapper() });

    const requestBody = {
      format: 'yaml' as const,
      tables: [['public', 'users']],
      tablesSchema: { public: { users: [{ name: 'id', type: 'integer', attributes: [] }] } },
    };

    await result.current.mutateAsync(requestBody);

    expect(mockPost).toHaveBeenCalledWith(
      '/api/datasources/uid/ds-uid/resources/generate-schema',
      requestBody
    );
  });

  it('surfaces errors from the API', async () => {
    const mockPost = jest.fn().mockRejectedValue(new Error('Server error'));
    mockGetBackendSrv.mockReturnValue({ post: mockPost });

    const { result } = renderHook(() => useGenerateSchemaMutation('ds-uid'), { wrapper: createWrapper() });

    await expect(
      result.current.mutateAsync({
        format: 'yaml',
        tables: [['public', 'users']],
        tablesSchema: {},
      })
    ).rejects.toThrow('Server error');
  });
});
