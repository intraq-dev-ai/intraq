import type { AnalyzerExecution } from './types';

export type AnalyzerRunResultState = 'empty' | 'populated';

export interface AnalyzerRunOutcome {
  outcome: 'answered' | 'needs_review';
  reason?: string;
  resultState: AnalyzerRunResultState;
}

const EMPTY_RESULT_REASON = 'Analyzer completed but returned no matching rows for the applied filters.';

export function classifyAnalyzerRunOutcome(executions: AnalyzerExecution[]): AnalyzerRunOutcome {
  const resultState = executions.length > 0 && executions.every(executionHasNoRows)
    ? 'empty'
    : 'populated';
  if (resultState === 'empty') {
    return {
      outcome: 'needs_review',
      reason: EMPTY_RESULT_REASON,
      resultState
    };
  }
  return {
    outcome: 'answered',
    resultState
  };
}

function executionHasNoRows(execution: AnalyzerExecution): boolean {
  const totalRows = readExecutionRowCount(execution);
  return totalRows <= 0;
}

function readExecutionRowCount(execution: AnalyzerExecution): number {
  if (typeof execution.totalRows === 'number' && Number.isFinite(execution.totalRows)) return execution.totalRows;
  if (typeof execution.rowCount === 'number' && Number.isFinite(execution.rowCount)) return execution.rowCount;
  if (Array.isArray(execution.rows)) return execution.rows.length;
  if (typeof execution.fetchedRows === 'number' && Number.isFinite(execution.fetchedRows)) return execution.fetchedRows;
  return 0;
}

