export type SqlQueryCell = string | number | boolean | null;
export type SqlQueryRow = Record<string, SqlQueryCell>;

export interface SqlQueryResult {
  columns: string[];
  rows: SqlQueryRow[];
  rowCount: number;
  executionTime: number;
  dataSource: { id: string; name: string; type: string };
  columnTypes: Array<{ name: string; type: string }>;
  pagination?: {
    hasMore: boolean;
    limit: number;
    offset: number;
    page: number;
    pageSize: number;
    totalRows?: number;
  };
  query: string;
}

export type SqlQueryEngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; statusCode: 400 | 401 | 403 | 404 | 502 | 504; error: string };

export interface SqlQueryExecuteOptions {
  dataSourceId?: string;
  defaultLimit?: number;
  maxLimit?: number;
  parameterValues?: Record<string, unknown>;
  query: string;
  rowFilters?: readonly FilterExpression[];
  tempDataSource?: unknown;
}

export type AggregateFunction = 'avg' | 'count' | 'max' | 'min' | 'sum';

export type SelectExpression =
  | { kind: 'field'; fieldName: string; resultName: string }
  | {
    expressionSql?: string;
    fieldName: string | '*';
    fieldNames?: string[];
    functionName: AggregateFunction;
    kind: 'aggregate';
    resultName: string;
  }
  | { fieldNames: string[]; kind: 'computed'; resultName: string; sql: string; valueType: 'boolean' | 'number' | 'string' };

export interface ParsedQuery {
  tableName: string | null;
  expressions: SelectExpression[] | '*';
  filters: FilterExpression[];
  groupBy: string[];
  having: FilterExpression[];
  orderBy: Array<{ name: string; direction: 'asc' | 'desc' }>;
  limit: number | null;
}

export interface FilterExpression {
  fieldName: string;
  operator: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'between' | 'in' | 'like' | 'is-null' | 'is-not-null';
  value?: SqlQueryCell;
  values?: SqlQueryCell[];
}
