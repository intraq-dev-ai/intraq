import type { BuilderActionPlan } from '../types';
import { normalizeChartType } from '../dashboard-element-normalization';

export function componentTypeFromPlan(plan: BuilderActionPlan, createAction?: string): string {
  if (createAction === 'create_table') return 'table';
  if (createAction === 'create_card') return 'card';
  if (createAction === 'create_matrix') return 'matrix';
  if (createAction === 'create_filter') return 'filter';
  if (createAction === 'create_text') return 'text';
  const componentType = readString(plan.componentType);
  return componentType && !normalizeChartType(componentType) ? componentType : 'chart';
}

export function textConfigFromAction(params: Record<string, unknown>): Record<string, unknown> {
  return {
    badge: readString(params.badge) ?? '',
    showIcon: params.showIcon !== false,
    text: readString(params.text) ?? readString(params.content) ?? '',
    textVariant: readTextVariant(params.variant ?? params.textVariant),
    tone: readTextTone(params.tone ?? params.severity)
  };
}

function readTextTone(value: unknown): string {
  const tone = readString(value)?.toLowerCase();
  return tone === 'critical' || tone === 'info' || tone === 'success' || tone === 'warning' ? tone : 'neutral';
}

function readTextVariant(value: unknown): string {
  const variant = readString(value)?.toLowerCase();
  return variant === 'body' || variant === 'section' ? variant : 'insight';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
