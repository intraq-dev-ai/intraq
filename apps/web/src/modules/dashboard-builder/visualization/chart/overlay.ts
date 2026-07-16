import type { VisualizationData } from '../../types';

export interface ChartOverlayItem {
  key: string;
  label: string;
  marker: string;
  title: string;
  value: string;
}

interface ChartOverlayConfig {
  collectionPaths: string[];
  enabled: boolean;
  itemStep: number;
  labelField?: string;
  labelPaths: string[];
  limit: number;
  markerField?: string;
  markerMap: Record<string, string>;
  markerPaths: string[];
  payloadField?: string;
  placement: 'bottom' | 'top';
  valueField?: string;
  valuePaths: string[];
  valuePrefix: string;
  valueUnit: string;
}

export function chartOverlayItems(config: unknown, data: VisualizationData): ChartOverlayItem[] {
  const overlay = readChartOverlayConfig(config);
  if (!overlay.enabled || !data.rawData?.length) return [];
  const sourceItems = overlay.payloadField
    ? payloadOverlayItems(data.rawData, overlay)
    : rowOverlayItems(data.rawData, overlay);
  return sourceItems
    .filter((_, index) => index % overlay.itemStep === 0)
    .slice(0, overlay.limit)
    .map((item, index) => overlayItem(item, index, overlay, data.labels[index] ?? ''));
}

export function chartOverlayPlacement(config: unknown): 'bottom' | 'top' {
  return readChartOverlayConfig(config).placement;
}

export function chartOverlayFieldNames(config: unknown): string[] {
  const overlay = readChartOverlayConfig(config);
  if (!overlay.enabled) return [];
  return unique([
    overlay.labelField,
    overlay.markerField,
    overlay.payloadField,
    overlay.valueField
  ]);
}

function readChartOverlayConfig(config: unknown): ChartOverlayConfig {
  const record = readRecord(config);
  const overlay = readRecord(record.chartOverlay ?? record.overlay ?? record.dataOverlay ?? record.contextOverlay);
  const fieldRecord = readRecord(overlay.fields);
  const payloadField = readString(overlay.payloadField ?? overlay.sourceField ?? fieldRecord.payload);
  const labelField = readString(overlay.labelField ?? fieldRecord.label);
  const markerField = readString(overlay.markerField ?? overlay.iconField ?? fieldRecord.marker ?? fieldRecord.icon);
  const valueField = readString(overlay.valueField ?? fieldRecord.value);
  const collectionPaths = readStringList(overlay.collectionPaths ?? overlay.collectionPath ?? overlay.itemsPath ?? overlay.path);
  const labelPaths = readStringList(overlay.labelPaths ?? overlay.labelPath ?? overlay.itemLabelPath);
  const markerPaths = readStringList(overlay.markerPaths ?? overlay.markerPath ?? overlay.iconPath ?? overlay.itemMarkerPath ?? overlay.itemIconPath);
  const valuePaths = readStringList(overlay.valuePaths ?? overlay.valuePath ?? overlay.itemValuePath);
  const hasAnySource = Boolean(payloadField || labelField || markerField || valueField || labelPaths.length || markerPaths.length || valuePaths.length);
  return {
    collectionPaths,
    enabled: readBoolean(overlay.enabled, hasAnySource),
    itemStep: Math.max(1, readPositiveInteger(overlay.itemStep ?? overlay.step ?? overlay.sampleEvery) ?? 1),
    labelField,
    labelPaths,
    limit: Math.max(1, readPositiveInteger(overlay.limit ?? overlay.maxItems) ?? 12),
    markerField,
    markerMap: readStringRecord(overlay.markerMap ?? overlay.iconMap),
    markerPaths,
    payloadField,
    placement: readString(overlay.placement) === 'bottom' ? 'bottom' : 'top',
    valueField,
    valuePaths,
    valuePrefix: readText(overlay.valuePrefix) ?? '',
    valueUnit: readText(overlay.valueUnit ?? overlay.unit ?? overlay.suffix) ?? ''
  };
}

function payloadOverlayItems(rows: Array<Record<string, unknown>>, overlay: ChartOverlayConfig): unknown[] {
  if (!overlay.payloadField) return [];
  const payload = rows.map(row => parseJsonValue(row[overlay.payloadField as string])).find(value => value !== undefined && value !== null);
  if (payload === undefined || payload === null) return [];
  const selected = overlay.collectionPaths.length
    ? overlay.collectionPaths.map(path => readPath(payload, path)).find(Array.isArray)
    : payload;
  return Array.isArray(selected) ? selected : [];
}

function rowOverlayItems(rows: Array<Record<string, unknown>>, overlay: ChartOverlayConfig): unknown[] {
  return rows.filter(row =>
    hasValue(overlay.labelField ? row[overlay.labelField] : undefined)
    || hasValue(overlay.markerField ? row[overlay.markerField] : undefined)
    || hasValue(overlay.valueField ? row[overlay.valueField] : undefined)
  );
}

function overlayItem(item: unknown, index: number, overlay: ChartOverlayConfig, fallbackLabel: unknown): ChartOverlayItem {
  const label = stringValue(valueFromItem(item, overlay.labelField, overlay.labelPaths)) ?? stringValue(fallbackLabel) ?? '';
  const markerRaw = stringValue(valueFromItem(item, overlay.markerField, overlay.markerPaths)) ?? '';
  const valueRaw = valueFromItem(item, overlay.valueField, overlay.valuePaths);
  const value = valueText(valueRaw, overlay);
  const marker = overlay.markerMap[markerRaw] ?? markerRaw;
  return {
    key: `${index}:${label}:${marker}:${value}`,
    label,
    marker,
    title: [label, markerRaw, value].filter(Boolean).join(' - '),
    value
  };
}

function valueFromItem(item: unknown, field: string | undefined, paths: string[]): unknown {
  const source = parseJsonValue(item);
  for (const path of paths) {
    const value = readPath(source, path);
    if (hasValue(value)) return value;
  }
  if (field && isRecord(source)) return source[field];
  return undefined;
}

function valueText(value: unknown, overlay: ChartOverlayConfig): string {
  if (!hasValue(value)) return '';
  const text = typeof value === 'number' && Number.isFinite(value)
    ? String(Math.round(value))
    : String(value);
  return `${overlay.valuePrefix}${text}${overlay.valueUnit}`;
}

function readPath(value: unknown, path: string): unknown {
  const parts = path.split('.').flatMap(part => {
    const tokens: string[] = [];
    part.replace(/([^\[\]]+)|\[(\d+)\]/g, (_match, key: string | undefined, index: string | undefined) => {
      tokens.push(key ?? index ?? '');
      return '';
    });
    return tokens.filter(Boolean);
  });
  return parts.reduce<unknown>((current, part) => {
    const value = parseJsonValue(current);
    if (Array.isArray(value)) return value[Number(part)];
    return isRecord(value) ? value[part] : undefined;
  }, value);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readStringRecord(value: unknown): Record<string, string> {
  const record = readRecord(value);
  return Object.fromEntries(Object.entries(record).flatMap(([key, item]) =>
    typeof item === 'string' ? [[key, item]] : []
  ));
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(item => {
    const text = readString(item);
    return text ? [text] : [];
  });
  const text = readString(value);
  return text ? [text] : [];
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPositiveInteger(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
