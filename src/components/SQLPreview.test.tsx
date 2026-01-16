// Mock Prism BEFORE any imports to avoid issues with syntax highlighting
jest.mock('prismjs', () => ({
  highlight: (code: string) => code,
  languages: { sql: {} },
}));

// Mock prism-sql to avoid it trying to extend Prism
jest.mock('prismjs/components/prism-sql', () => ({}));

// Mock the useDatasource hook
jest.mock('../hooks/useDatasource', () => ({
  useDatasource: jest.fn(),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SQLPreview } from './SQLPreview';
import { useDatasource } from '../hooks/useDatasource';

const mockUseDatasource = useDatasource as jest.Mock;

describe('SQLPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatasource.mockReturnValue({
      datasource: null,
      isLoading: false,
      error: null,
    });
  });

  it('should not render when sql is empty', () => {
    const { container } = render(<SQLPreview sql="" />);
    expect(container.firstChild).toBeNull();
  });

  it('should render SQL preview with syntax highlighting', () => {
    const sql = 'SELECT * FROM orders WHERE status = "completed"';

    render(<SQLPreview sql={sql} />);

    expect(screen.getByLabelText('Generated SQL query')).toHaveTextContent(sql);
  });

  it('should render Edit SQL in Explore button', () => {
    render(<SQLPreview sql="SELECT * FROM orders" />);

    const button = screen.getByRole('link', { name: /Edit SQL in Explore/i });
    expect(button).toBeInTheDocument();
  });

  describe('Explore URL construction', () => {
    it('should construct Explore URL without datasource when none configured', () => {
      mockUseDatasource.mockReturnValue({
        datasource: null,
        isLoading: false,
        error: null,
      });

      render(<SQLPreview sql="SELECT * FROM orders" />);

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
      mockUseDatasource.mockReturnValue({
        datasource: { type: 'postgres', uid: 'pg-prod', name: 'PostgreSQL Prod' },
        isLoading: false,
        error: null,
      });

      render(<SQLPreview sql="SELECT * FROM orders" exploreSqlDatasourceUid="pg-prod" />);

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
      mockUseDatasource.mockReturnValue({
        datasource: { type: 'mysql', uid: 'mysql-1' },
        isLoading: false,
        error: null,
      });

      render(<SQLPreview sql="SELECT COUNT(*) FROM users" exploreSqlDatasourceUid="mysql-1" />);

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
        mockUseDatasource.mockReturnValue({
          datasource: { type, uid },
          isLoading: false,
          error: null,
        });

        const { unmount } = render(<SQLPreview sql="SELECT 1" exploreSqlDatasourceUid={uid} />);

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
    render(<SQLPreview sql="SELECT * FROM orders" exploreSqlDatasourceUid="my-ds-uid" />);

    expect(mockUseDatasource).toHaveBeenCalledWith('my-ds-uid');
  });

  it('should call useDatasource with undefined when no UID provided', () => {
    render(<SQLPreview sql="SELECT * FROM orders" />);

    expect(mockUseDatasource).toHaveBeenCalledWith(undefined);
  });
});
