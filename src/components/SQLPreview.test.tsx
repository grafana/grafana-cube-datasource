// Mock Prism BEFORE any imports to avoid issues with syntax highlighting
jest.mock('prismjs', () => ({
  highlight: (code: string) => code,
  languages: { sql: {} },
}));

// Mock prism-sql to avoid it trying to extend Prism
jest.mock('prismjs/components/prism-sql', () => ({}));

// Mock the useDatasourceQuery hook
jest.mock('queries', () => ({
  useDatasourceQuery: jest.fn(),
}));

import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithClient } from 'testUtils';
import { SQLPreview } from './SQLPreview';
import { useDatasourceQuery } from 'queries';

const mockUseDatasourceQuery = useDatasourceQuery as jest.Mock;

const DEFAULT_DS_ID = 'pg-1';

describe('SQLPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatasourceQuery.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    });
  });

  it('should not render when sql is empty', () => {
    const { container } = renderWithClient(<SQLPreview sql="" />);
    expect(container.firstChild).toBeNull();
  });

  it('should render SQL preview with syntax highlighting', () => {
    const sql = 'SELECT * FROM orders WHERE status = "completed"';

    renderWithClient(<SQLPreview sql={sql} />);

    expect(screen.getByLabelText('Generated SQL query')).toHaveTextContent(sql);
  });

  it('should render Edit SQL in Explore button', () => {
    renderWithClient(<SQLPreview sql="SELECT * FROM orders" exploreSqlDatasourceUid={DEFAULT_DS_ID} />);

    const button = screen.getByRole('link', { name: /Edit SQL in Explore/i });
    expect(button).toBeInTheDocument();
  });

  describe('Explore URL construction', () => {
    it('should construct Explore URL without datasource when none configured', () => {
      mockUseDatasourceQuery.mockReturnValue({
        data: null,
        isPending: false,
        error: null,
      });

      renderWithClient(<SQLPreview sql="SELECT * FROM orders" exploreSqlDatasourceUid={DEFAULT_DS_ID} />);

      const button = screen.getByRole('link', { name: /Edit SQL in Explore/i });
      const href = button.getAttribute('href');

      expect(href).toContain('/explore?left=');

      // Decode and parse the URL
      const leftParam = decodeURIComponent(href!.split('left=')[1]);
      const exploreState = JSON.parse(leftParam);

      // Should NOT have top-level datasource
      expect(exploreState.datasource).toBeUndefined();

      // Query should NOT have datasource
      expect(exploreState.queries[0].datasource).toBeUndefined();

      // Should have the SQL
      expect(exploreState.queries[0].rawSql).toBe('SELECT * FROM orders');
    });

    it('should construct Explore URL with datasource when configured', () => {
      mockUseDatasourceQuery.mockReturnValue({
        data: { type: 'postgres', uid: 'pg-prod', name: 'PostgreSQL Prod' },
        isPending: false,
        error: null,
      });

      renderWithClient(<SQLPreview sql="SELECT * FROM orders" exploreSqlDatasourceUid={DEFAULT_DS_ID} />);

      const button = screen.getByRole('link', { name: /Edit SQL in Explore/i });
      const href = button.getAttribute('href');

      // Decode and parse the URL
      const leftParam = decodeURIComponent(href!.split('left=')[1]);
      const exploreState = JSON.parse(leftParam);

      // Should have top-level datasource
      expect(exploreState.datasource).toEqual({
        type: 'postgres',
        uid: 'pg-prod',
      });

      // Query should have datasource
      expect(exploreState.queries[0].datasource).toEqual({
        type: 'postgres',
        uid: 'pg-prod',
      });

      // Should have the SQL
      expect(exploreState.queries[0].rawSql).toBe('SELECT * FROM orders');
    });

    it('should include correct query format for Explore', () => {
      mockUseDatasourceQuery.mockReturnValue({
        data: { type: 'mysql', uid: 'mysql-1' },
        isPending: false,
        error: null,
      });

      renderWithClient(<SQLPreview sql="SELECT COUNT(*) FROM users" exploreSqlDatasourceUid="mysql-1" />);

      const button = screen.getByRole('link', { name: /Edit SQL in Explore/i });
      const href = button.getAttribute('href');
      const leftParam = decodeURIComponent(href!.split('left=')[1]);
      const exploreState = JSON.parse(leftParam);

      expect(exploreState.queries[0]).toEqual({
        refId: 'A',
        rawSql: 'SELECT COUNT(*) FROM users',
        // format field is omitted to let each datasource use its default
        // (different datasources expect different types: string vs numeric enum)
        rawQuery: true,
        datasource: {
          type: 'mysql',
          uid: 'mysql-1',
        },
      });

      expect(exploreState.range).toEqual({
        from: 'now-1h',
        to: 'now',
      });
    });

    it('should handle different SQL datasource types', () => {
      const testCases = [
        { type: 'postgres', uid: 'pg-1' },
        { type: 'mysql', uid: 'mysql-1' },
        { type: 'grafana-bigquery-datasource', uid: 'bq-1' },
        { type: 'snowflake', uid: 'sf-1' },
      ];

      testCases.forEach(({ type, uid }) => {
        mockUseDatasourceQuery.mockReturnValue({
          data: { type, uid },
          isPending: false,
          error: null,
        });

        const { unmount } = renderWithClient(<SQLPreview sql="SELECT 1" exploreSqlDatasourceUid={uid} />);

        const button = screen.getByRole('link', { name: /Edit SQL in Explore/i });
        const href = button.getAttribute('href');
        const leftParam = decodeURIComponent(href!.split('left=')[1]);
        const exploreState = JSON.parse(leftParam);

        expect(exploreState.datasource.type).toBe(type);
        expect(exploreState.datasource.uid).toBe(uid);

        unmount();
      });
    });
  });

  it('should call useDatasource with the provided UID', () => {
    renderWithClient(<SQLPreview sql="SELECT * FROM orders" exploreSqlDatasourceUid="my-ds-uid" />);

    expect(mockUseDatasourceQuery).toHaveBeenCalledWith('my-ds-uid');
  });

  it('should call useDatasource with undefined when no UID provided', () => {
    renderWithClient(<SQLPreview sql="SELECT * FROM orders" />);

    expect(mockUseDatasourceQuery).toHaveBeenCalledWith(undefined);
  });

  describe('Loading state', () => {
    it('should disable the button and show spinner when datasource is loading', () => {
      mockUseDatasourceQuery.mockReturnValue({
        data: null,
        isPending: true,
        error: null,
      });

      renderWithClient(<SQLPreview sql="SELECT * FROM orders" exploreSqlDatasourceUid="pg-prod" />);

      // Button text stays the same, but button is disabled with spinner icon
      const button = screen.getByRole('link', { name: /Edit SQL in Explore/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('should show normal button after loading completes', () => {
      mockUseDatasourceQuery.mockReturnValue({
        data: { type: 'postgres', uid: 'pg-prod', name: 'PostgreSQL Prod' },
        isPending: false,
        error: null,
      });

      renderWithClient(<SQLPreview sql="SELECT * FROM orders" exploreSqlDatasourceUid="pg-prod" />);

      const button = screen.getByRole('link', { name: /Edit SQL in Explore/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('should not show the button when no datasource is configured', () => {
      mockUseDatasourceQuery.mockReturnValue({
        data: null,
        isPending: false,
        error: null,
      });

      renderWithClient(<SQLPreview sql="SELECT * FROM orders" />);

      const button = screen.queryByRole('link', { name: /Edit SQL in Explore/i });
      expect(button).not.toBeInTheDocument();
    });
  });
});
