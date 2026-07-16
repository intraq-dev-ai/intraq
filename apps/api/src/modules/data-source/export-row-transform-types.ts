import type { SqlQueryRow } from './sql-query-types.js';

export interface ExportRowTransformResult {
  columns: string[];
  includeSectionHeader?: boolean;
  rows: SqlQueryRow[];
}

export type ExportRow = Record<string, unknown>;

export interface ExportColumnMapping {
  defaultValue?: unknown;
  field?: string;
  header: string;
  value?: unknown;
}

export interface ExportGenerateRowsConfig {
  groupBy: string[];
  includeSourceRows: boolean;
  position: 'after' | 'before' | 'replace';
  rows: unknown[];
}

export interface ExportTransformConfig {
  appendRows: unknown[];
  columns: ExportColumnMapping[];
  generateRows: ExportGenerateRowsConfig[];
  includeSectionHeader?: boolean;
  splitByGroupFlag?: Record<string, unknown>;
  sortBy: Array<{ direction: 'asc' | 'desc'; field: string }>;
}
