import type { DashboardElement } from '../types';
import type { DashboardCanvasIndicatorSummary } from './canvas/dashboard-canvas-indicators';
import type { TableFieldDraft } from './component-info-dialog-options';

export function fieldDraftsForComponentInfo(
  element: DashboardElement | null,
  summary: DashboardCanvasIndicatorSummary | null
): TableFieldDraft[] {
  if (!element) return [];
  const names = configuredFieldNamesForComponentInfo(element, summary);
  return names.map(columnName => ({
    columnName,
    displayName: displayNameForComponentInfoField(element.config ?? {}, columnName)
  }));
}

function configuredFieldNamesForComponentInfo(
  element: DashboardElement,
  summary: DashboardCanvasIndicatorSummary | null
): string[] {
  const config = element.config ?? {};
  if (element.type === 'chart') {
    const chartSeries = fieldNamesFromArray(config.ySeries);
    if (chartSeries.length > 0) return chartSeries;
    const singleValue = readString(config.valueField);
    return singleValue ? [singleValue] : [];
  }

  const names = [
    ...fieldNamesFromArray(config.columns),
    ...fieldNamesFromArray(config.rowFields),
    ...fieldNamesFromArray(config.columnFields),
    ...fieldNamesFromArray(config.valueFields),
    ...fieldNamesFromArray(config.ySeries),
    ...fieldNamesFromArray(config.fields),
    readString(config.xField),
    readString(config.valueField),
    readString(config.field),
    ...(summary?.fields ?? [])
  ].filter(Boolean);
  return Array.from(new Set(names));
}

function fieldNamesFromArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = readString(value);
    return single ? [single] : [];
  }
  return value.flatMap(item => {
    if (typeof item === 'string' && item.trim()) return [item.trim()];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as { field?: unknown; key?: unknown; name?: unknown };
    const field = readString(record.field ?? record.key ?? record.name);
    return field ? [field] : [];
  });
}

function displayNameForComponentInfoField(config: Record<string, unknown>, field: string): string {
  const fieldLabels = isRecord(config.fieldLabels) ? config.fieldLabels : {};
  const seriesLabels = isRecord(config.ySeriesLabels ?? config.seriesLabels) ? (config.ySeriesLabels ?? config.seriesLabels) : {};
  const column = findFieldObject(config.columns, field)
    ?? findFieldObject(config.rowFields, field)
    ?? findFieldObject(config.columnFields, field)
    ?? findFieldObject(config.valueFields, field);
  return readString(column?.label)
    || readString(column?.displayName)
    || readString(column?.customLabel)
    || readString(fieldLabels[field])
    || readString(seriesLabels[field])
    || labelFor(field);
}

function findFieldObject(value: unknown, field: string): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const itemField = readString(item.field ?? item.key ?? item.name);
    if (itemField === field) return item;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function labelFor(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}
