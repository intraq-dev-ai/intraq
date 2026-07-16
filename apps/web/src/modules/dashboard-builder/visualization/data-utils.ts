import type { VisualizationData } from '../types';
import type {
  VisualizationDataRequest,
  VisualizationDataRequestContext
} from './data-request-types';

export function withVisualizationRuntimeContext(
  data: VisualizationData,
  request: VisualizationDataRequest,
  requestContext?: VisualizationDataRequestContext | undefined
): VisualizationData {
  const patch = runtimeContextPatch(request, requestContext);
  if (!patch.runtimeContext) return data;
  return {
    ...data,
    runtimeContext: {
      ...(data.runtimeContext ?? {}),
      ...patch.runtimeContext
    }
  };
}

export function runtimeContextPatch(
  request: VisualizationDataRequest,
  requestContext?: VisualizationDataRequestContext | undefined
): Pick<VisualizationData, 'runtimeContext'> {
  const parameterValues = {
    ...(request.parameterValues ?? {}),
    ...(requestContext?.runtimeParameterValues ?? {})
  };
  return Object.keys(parameterValues).length > 0
    ? { runtimeContext: { parameterValues } }
    : {};
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readStringFromRecord(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === 'string' && field.trim() ? field.trim() : undefined;
}

export function parameterValuesPatch(value: unknown): { parameterValues?: Record<string, unknown> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter((entry): entry is [string, unknown] =>
    entry[0].trim().length > 0
    && isSerializableParameterValue(entry[1])
  );
  return entries.length > 0 ? { parameterValues: Object.fromEntries(entries) } : {};
}

export function runtimeParameterValuesPatch(value: unknown): { parameterValues?: Record<string, unknown> } {
  return parameterValuesPatch(value);
}

export function mergeParameterValues(
  base: Record<string, unknown> | undefined,
  runtime: Record<string, unknown> | undefined
): Record<string, unknown> {
  const baseValues = parameterValuesPatch(base).parameterValues ?? {};
  const runtimeValues = runtimeParameterValuesPatch(runtime).parameterValues ?? {};
  return { ...baseValues, ...runtimeValues };
}

function isSerializableParameterValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  return Array.isArray(value) && value.length > 0 && value.every(item =>
    item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
  );
}
