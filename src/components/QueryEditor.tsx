import React, { useMemo } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { CubeDataSourceOptions, CubeQuery } from '../types';
import { detectUnsupportedFeatures } from '../utils/detectUnsupportedFeatures';
import { JsonQueryEditor } from './JsonQueryEditor';
import { VisualQueryEditor } from './VisualQueryEditor';

/**
 * Main QueryEditor component that decides which editor mode to use.
 *
 * If the query contains unsupported features (time dimensions, dashboard variables,
 * complex filter groups), shows a read-only JSON view.
 *
 * Otherwise, shows the visual query builder.
 */
export function QueryEditor(props: QueryEditorProps<DataSource, CubeQuery, CubeDataSourceOptions>) {
  const { query } = props;

  // Check for unsupported features before rendering visual builder
  const unsupportedFeatures = useMemo(() => detectUnsupportedFeatures(query), [query]);

  // If query has unsupported features, show read-only JSON view instead
  if (unsupportedFeatures.length > 0) {
    return <JsonQueryEditor query={query} unsupportedFeatures={unsupportedFeatures} />;
  }

  // Query is compatible with visual builder
  return <VisualQueryEditor {...props} />;
}
