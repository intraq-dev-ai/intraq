import type { DashboardElement, VisualizationData, VisualizationSpec } from '../types';
import {
  aggregateCalculatedRows,
  applyCalculatedFields,
  readCalculatedFields,
  usesCalculatedMeasure
} from './calculated-field-runtime';
import { dimensionEncoding, measureEncodings } from './spec';

export function applyCalculatedFieldsToVisualizationData(
  element: DashboardElement,
  spec: VisualizationSpec,
  data: VisualizationData
): VisualizationData {
  const fields = readCalculatedFields(element.config?.calculatedFields);
  if (fields.length === 0 || !data.rawData?.length) return data;

  const rawData = data.rawData.map((row, index, rows) => applyCalculatedFields(row, fields, index, rows));
  if (!usesCalculatedEncoding(spec, fields)) return { ...data, rawData };

  const dimension = dimensionEncoding(spec);
  const measures = measureEncodings(spec);
  if (!dimension || measures.length === 0) return { ...data, rawData };

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rawData) {
    const key = String(row[dimension.field] ?? '');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const labels = Array.from(groups.keys()).slice(0, spec.limit ?? groups.size);
  const datasets = measures.map(measure => ({
    aggregatedData: true,
    data: labels.map(label => aggregateCalculatedRows(groups.get(label) ?? [], measure.field, measure.aggregation ?? 'sum')),
    label: measure.field
  }));
  return { ...data, datasets, labels, rawData };
}

function usesCalculatedEncoding(spec: VisualizationSpec, fields: ReturnType<typeof readCalculatedFields>): boolean {
  const names = new Set(fields.map(field => field.name));
  return usesCalculatedMeasure(spec, fields) || spec.encodings.some(encoding => names.has(encoding.field));
}
