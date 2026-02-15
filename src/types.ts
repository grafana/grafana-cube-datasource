import type { TimeDimension, TQueryOrderArray, TQueryOrderObject } from '@cubejs-client/core';
import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

/**
 * Order direction for sorting. This is a subset of Cube's QueryOrder (excludes 'none')
 * because our UI only supports ascending and descending.
 */
export type Order = 'asc' | 'desc';
export const DEFAULT_ORDER: Order = 'asc';

/**
 * All filter operators supported by the Cube API.
 *
 * The visual builder only supports `equals` and `notEquals`.
 * Other operators can be configured via panel JSON and will cause the
 * query editor to switch to the read-only JSON viewer
 * (see detectUnsupportedFeatures).
 */
export enum Operator {
  // Supported by the visual builder
  Equals = 'equals',
  NotEquals = 'notEquals',
  // Binary operators (require values)
  Contains = 'contains',
  NotContains = 'notContains',
  StartsWith = 'startsWith',
  NotStartsWith = 'notStartsWith',
  EndsWith = 'endsWith',
  NotEndsWith = 'notEndsWith',
  Gt = 'gt',
  Gte = 'gte',
  Lt = 'lt',
  Lte = 'lte',
  InDateRange = 'inDateRange',
  NotInDateRange = 'notInDateRange',
  BeforeDate = 'beforeDate',
  BeforeOrOnDate = 'beforeOrOnDate',
  AfterDate = 'afterDate',
  AfterOrOnDate = 'afterOrOnDate',
  // Unary operators (no values needed)
  Set = 'set',
  NotSet = 'notSet',
}

/** Operators that the visual query builder supports. */
export const VISUAL_BUILDER_OPERATORS: ReadonlySet<Operator> = new Set([
  Operator.Equals,
  Operator.NotEquals,
]);

/** Unary operators that don't require a values array. */
export const UNARY_OPERATORS: ReadonlySet<Operator> = new Set([
  Operator.Set,
  Operator.NotSet,
]);

export interface CubeFilter {
  member: string;
  operator: Operator;
  /** Required for binary operators. Omit for unary operators (set, notSet). */
  values?: string[];
}

export interface CubeQuery extends DataQuery {
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

export const DEFAULT_QUERY: Partial<CubeQuery> = {};

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
export interface CubeDataSourceOptions extends DataSourceJsonData {
  cubeApiUrl?: string;
  deploymentType?: 'cloud' | 'self-hosted' | 'self-hosted-dev';
  /** UID of the SQL datasource to use when clicking "Edit SQL in Explore" */
  exploreSqlDatasourceUid?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface CubeSecureJsonData {
  apiKey?: string; // For Cube Cloud
  apiSecret?: string; // For self-hosted Cube (JWT generation)
}

/**
 * Data Model types -- used by the Data Model config page
 * to interact with Cube's playground endpoints (db-schema, generate-schema, model-files).
 */

export interface DatabaseColumn {
  name: string;
  type: string;
  attributes: string[];
}

export interface DbSchemaResponse {
  tablesSchema: Record<string, Record<string, DatabaseColumn[]>>;
}

export interface ModelFile {
  fileName: string;
  content: string;
}

export interface ModelFilesResponse {
  files: ModelFile[];
}

export interface GenerateSchemaRequest {
  format: 'yaml';
  tables: string[][];
  tablesSchema: DbSchemaResponse['tablesSchema'];
}
