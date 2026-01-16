import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

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
  timeDimensions?: any[];
  limit?: number;
  filters?: CubeFilter[];
  order?: Record<string, 'asc' | 'desc'>;
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
