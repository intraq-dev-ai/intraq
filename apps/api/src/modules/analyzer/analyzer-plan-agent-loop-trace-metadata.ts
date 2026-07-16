import { isRecord } from './analyzer-plan-utils.js';

const ANALYZER_PLAN_TRACE_METADATA_KEY = '__analyzerPlanTraceMetadata';

export function attachAnalyzerPlanTraceMetadata<T extends object>(
  value: T,
  metadata: Record<string, unknown>
): T {
  Object.defineProperty(value, ANALYZER_PLAN_TRACE_METADATA_KEY, {
    configurable: true,
    enumerable: false,
    value: metadata
  });
  return value;
}

export function readAnalyzerPlanTraceMetadata(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const metadata = value[ANALYZER_PLAN_TRACE_METADATA_KEY];
  return isRecord(metadata) ? metadata : null;
}
