import { renderHook, act } from '@testing-library/react';
import { useQueryEditorHandlers } from './useQueryEditorHandlers';
import { CubeQuery, Operator } from '../types';

describe('useQueryEditorHandlers', () => {
  describe('onFiltersChange', () => {
    it('should preserve non-visual-builder filters when updating visual builder filters', () => {
      const advancedFilter = { member: 'orders.amount', operator: Operator.Gt, values: ['100'] };
      const andGroup = {
        and: [
          { member: 'orders.status', operator: Operator.Equals, values: ['active'] },
          { member: 'orders.region', operator: Operator.Equals, values: ['US'] },
        ],
      };
      const visualFilter = { member: 'orders.status', operator: Operator.Equals, values: ['completed'] };

      const query: CubeQuery = {
        refId: 'A',
        filters: [visualFilter, advancedFilter, andGroup],
      };

      const onChange = jest.fn();
      const onRunQuery = jest.fn();

      const { result } = renderHook(() => useQueryEditorHandlers(query, onChange, onRunQuery));

      const updatedVisualFilter = { member: 'orders.status', operator: Operator.Equals, values: ['shipped'] };
      act(() => {
        result.current.onFiltersChange([updatedVisualFilter]);
      });

      const updatedQuery = onChange.mock.calls[0][0];
      expect(updatedQuery.filters).toContainEqual(updatedVisualFilter);
      expect(updatedQuery.filters).toContainEqual(advancedFilter);
      expect(updatedQuery.filters).toContainEqual(andGroup);
      expect(updatedQuery.filters).toHaveLength(3);
    });

    it('should clear all filters when visual builder filters are emptied but preserve non-visual ones', () => {
      const advancedFilter = { member: 'orders.amount', operator: Operator.Gt, values: ['100'] };
      const query: CubeQuery = {
        refId: 'A',
        filters: [
          { member: 'orders.status', operator: Operator.Equals, values: ['completed'] },
          advancedFilter,
        ],
      };

      const onChange = jest.fn();
      const onRunQuery = jest.fn();

      const { result } = renderHook(() => useQueryEditorHandlers(query, onChange, onRunQuery));

      act(() => {
        result.current.onFiltersChange([]);
      });

      const updatedQuery = onChange.mock.calls[0][0];
      expect(updatedQuery.filters).toEqual([advancedFilter]);
    });

    it('should preserve template-variable filters even though they use a visual operator', () => {
      // A dashboard-variable filter uses the equals operator (a visual operator),
      // but its $var value can't be rendered as a selectable chip, so it must be
      // preserved here rather than relying on FilterField's callback list.
      const templateVarFilter = { member: 'orders.status', operator: Operator.Equals, values: ['$statusVar'] };
      const visualFilter = { member: 'orders.region', operator: Operator.Equals, values: ['US'] };

      const query: CubeQuery = {
        refId: 'A',
        filters: [visualFilter, templateVarFilter],
      };

      const onChange = jest.fn();
      const onRunQuery = jest.fn();

      const { result } = renderHook(() => useQueryEditorHandlers(query, onChange, onRunQuery));

      const updatedVisualFilter = { member: 'orders.region', operator: Operator.Equals, values: ['EU'] };
      act(() => {
        result.current.onFiltersChange([updatedVisualFilter]);
      });

      const updatedQuery = onChange.mock.calls[0][0];
      expect(updatedQuery.filters).toContainEqual(updatedVisualFilter);
      expect(updatedQuery.filters).toContainEqual(templateVarFilter);
      expect(updatedQuery.filters).toHaveLength(2);
    });

    it('should preserve template-variable filters with ${var:format} and [[var]] syntaxes when visual filters are emptied', () => {
      const formatVarFilter = { member: 'orders.status', operator: Operator.NotEquals, values: ['${statusVar:csv}'] };
      const legacyVarFilter = { member: 'orders.region', operator: Operator.Equals, values: ['[[regionVar]]'] };

      const query: CubeQuery = {
        refId: 'A',
        filters: [
          { member: 'orders.country', operator: Operator.Equals, values: ['US'] },
          formatVarFilter,
          legacyVarFilter,
        ],
      };

      const onChange = jest.fn();
      const onRunQuery = jest.fn();

      const { result } = renderHook(() => useQueryEditorHandlers(query, onChange, onRunQuery));

      act(() => {
        result.current.onFiltersChange([]);
      });

      const updatedQuery = onChange.mock.calls[0][0];
      expect(updatedQuery.filters).toContainEqual(formatVarFilter);
      expect(updatedQuery.filters).toContainEqual(legacyVarFilter);
      expect(updatedQuery.filters).toHaveLength(2);
    });

    it('should clear filters entirely when no filters remain', () => {
      const query: CubeQuery = {
        refId: 'A',
        filters: [{ member: 'orders.status', operator: Operator.Equals, values: ['completed'] }],
      };

      const onChange = jest.fn();
      const onRunQuery = jest.fn();

      const { result } = renderHook(() => useQueryEditorHandlers(query, onChange, onRunQuery));

      act(() => {
        result.current.onFiltersChange([]);
      });

      const updatedQuery = onChange.mock.calls[0][0];
      expect(updatedQuery.filters).toBeUndefined();
    });
  });
});
