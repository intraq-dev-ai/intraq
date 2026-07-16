import type {
  ChartDataExportSection,
  Row
} from './foundation-route-types.js';
import {
  asString,
  isRecord
} from './foundation-route-utils.js';

export function rowsFromChartData(chartData: Record<string, unknown>): Row[] {
  if (Array.isArray(chartData.rawData) && chartData.rawData.every(isRecord)) {
    return chartData.rawData.map(row => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, cellValue(value)])
    ) as Row);
  }
  const labels = Array.isArray(chartData.labels) ? chartData.labels : [];
  const datasets = Array.isArray(chartData.datasets) ? chartData.datasets.filter(isRecord) : [];
  return labels.map((label, index) => Object.fromEntries([
    ['label', cellValue(label)],
    ...datasets.flatMap(dataset => {
      const data = Array.isArray(dataset.data) ? dataset.data : [];
      const key = asString(dataset.label) ?? `value_${index + 1}`;
      return [[key, cellValue(data[index])] as [string, unknown]];
    })
  ]) as Row);
}

export function columnsForRows(rows: Row[]): string[] {
  return Array.from(new Set(rows.flatMap(row => Object.keys(row))));
}

export function csvForSections(sections: ChartDataExportSection[]): string {
  return sections.flatMap(section => {
    const rows = [...csvLinesForSection(section)];
    return [...rows, ''];
  }).join('\n');
}

export function* csvLinesForSection(section: ChartDataExportSection): Generator<string> {
  if (section.includeSectionHeader !== false) yield csvRow(['Component', section.componentTitle]);
  yield csvRow(section.columns);
  for (const row of section.rows) {
    yield csvRow(section.columns.map(column => row[column]));
  }
}

export function workbookXmlForSections(sections: ChartDataExportSection[]): string {
  const sheetNames = uniqueSheetNames(sections.map(section => section.componentTitle));
  const worksheets = sections.map((section, index) => [
    `<Worksheet ss:Name="${xmlAttr(sheetNames[index] ?? `Sheet ${index + 1}`)}"><Table>`,
    xmlRow(section.columns),
    ...section.rows.map(row => xmlRow(section.columns.map(column => row[column]))),
    '</Table></Worksheet>'
  ].join(''));
  return [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    ...worksheets,
    '</Workbook>'
  ].join('');
}

export function exportFileName(dashboardName: string | undefined, componentTitle: string | undefined, extension: string): string {
  return `${sanitizeExportBaseName(componentTitle ?? dashboardName ?? 'dashboard_export')}.${extension}`;
}

export function sanitizeExportFileName(value: string, extension: string): string {
  const base = sanitizeExportBaseName(value.replace(/\.[a-z0-9]+$/i, ''));
  return `${base}.${extension || 'bin'}`;
}

export function sanitizeExportBaseName(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'dashboard_export';
}

function uniqueSheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name, index) => {
    const base = (name || `Sheet ${index + 1}`).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || `Sheet ${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      const tail = ` ${suffix}`;
      candidate = `${base.slice(0, Math.max(1, 31 - tail.length))}${tail}`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function xmlRow(values: unknown[]): string {
  return `<Row>${values.map(value => {
    const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : typeof value === 'boolean' ? 'Boolean' : 'String';
    return `<Cell><Data ss:Type="${type}">${xmlText(value)}</Data></Cell>`;
  }).join('')}</Row>`;
}

function xmlText(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmlAttr(value: string): string {
  return xmlText(value).replace(/"/g, '&quot;');
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}
