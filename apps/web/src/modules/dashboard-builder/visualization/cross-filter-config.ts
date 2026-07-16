import type { DashboardElement } from '../types';

export type DashboardCrossFilterMode = 'auto' | 'disabled' | 'selected';

export function readDashboardCrossFilterMode(input: DashboardElement | Record<string, unknown> | undefined): DashboardCrossFilterMode {
  const config = dashboardElementConfig(input);
  const value = readString(config.crossFilterMode) ?? readString(config.crossFilterBehavior);
  if (value === 'disabled') return 'disabled';
  if (value === 'selected') return 'selected';
  return 'auto';
}

export function readDashboardCrossFilterTargetElementIds(
  input: DashboardElement | Record<string, unknown> | undefined
): string[] {
  const config = dashboardElementConfig(input);
  return dedupeStrings([
    ...readStringArray(config.crossFilterTargetElementIds),
    ...readStringArray(config.crossFilterTargets),
    ...readStringArray(config.crossFilterTargetComponents)
  ]);
}

function dashboardElementConfig(input: DashboardElement | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {};
  if ('config' in input && typeof input.config === 'object' && input.config !== null && !Array.isArray(input.config)) {
    return input.config as Record<string, unknown>;
  }
  return input;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim())
    : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
