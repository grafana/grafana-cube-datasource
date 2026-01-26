import type { TimeDimension, TQueryOrderArray, TQueryOrderObject } from '@cubejs-client/core';
import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

/**
 * Order direction for sorting. This is a subset of Cube's QueryOrder (excludes 'none')
 * because our UI only supports ascending and descending.
 */
export type Order = 'asc' | 'desc';
export const DEFAULT_ORDER: Order = 'asc';

export enum Operator {
  Equals = 'equals',
  NotEquals = 'notEquals',
}

export interface CubeFilter {
  member: string;
  operator: Operator;
  values: string[];
}

export interface MyQuery extends DataQuery {
  dimensions?: string[];
  measures?: string[];
  timeDimensions?: TimeDimension[];
  limit?: number;
  filters?: CubeFilter[];
  /**
   * Order can be array format (new) or object format (legacy saved queries).
   * Uses Cube's official order types for API compatibility.
   */
  order?: TQueryOrderArray | TQueryOrderObject;
}

export const DEFAULT_QUERY: Partial<MyQuery> = {};

export interface DataPoint {
  Time: number;
  Value: number;
}

export interface DataSourceResponse {
  datapoints: DataPoint[];
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  cubeApiUrl?: string;
  deploymentType?: 'cloud' | 'self-hosted' | 'self-hosted-dev';
  /** UID of the SQL datasource to use when clicking "Edit SQL in Explore" */
  exploreSqlDatasourceUid?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  apiKey?: string; // For Cube Cloud
  apiSecret?: string; // For self-hosted Cube (JWT generation)
}
