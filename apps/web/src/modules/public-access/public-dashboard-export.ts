import { formatCellValue } from './dashboard-values';
import type { PublicTableColumn, PublicTileModel } from './dashboard-rendering';

export type PublicComponentExportFormat = 'csv' | 'excel';

export interface PublicComponentExportData {
  columns: PublicTableColumn[];
  rows: Array<Record<string, unknown>>;
}

export function exportDataLimit(tile: PublicTileModel): number {
  return Math.max(tile.dataLimit, 5000);
}

export function componentExportData(tile: PublicTileModel): PublicComponentExportData {
  if (tile.kind === 'matrix' && tile.matrix) {
    const columns = [
      { key: '__row', label: tile.matrix.rowHeader },
      ...tile.matrix.columns.map(column => ({ key: column, label: column })),
      { key: '__total', label: 'Total' }
    ];
    const rows = tile.matrix.rows.map(row => ({
      __row: row.label,
      ...Object.fromEntries(tile.matrix?.columns.map((column, index) => [column, row.cells[index] ?? '']) ?? []),
      __total: row.total
    }));
    return { columns, rows };
  }

  if (tile.rows.length > 0) {
    const columns = exportColumnsForRows(tile);
    return { columns, rows: tile.rows };
  }

  if (tile.kind === 'chart' && tile.chart.labels.length > 0 && tile.chart.datasets.length > 0) {
    const columns = [
      { key: '__label', label: 'Label' },
      ...tile.chart.datasets.map(dataset => ({ key: dataset.label, label: dataset.label }))
    ];
    const rows = tile.chart.labels.map((label, index) => ({
      __label: label,
      ...Object.fromEntries(tile.chart.datasets.map(dataset => [dataset.label, dataset.values[index] ?? 0]))
    }));
    return { columns, rows };
  }

  if (tile.kind === 'card' && tile.cardMetrics.length > 0) {
    return {
      columns: [
        { key: 'metric', label: 'Metric' },
        { key: 'value', label: 'Value' },
        { key: 'detail', label: 'Detail' }
      ],
      rows: tile.cardMetrics.map(metric => ({
        detail: metric.helper,
        metric: metric.label,
        value: metric.value
      }))
    };
  }

  if (tile.sourceId && tile.columns.length > 0) {
    return { columns: tile.columns, rows: [] };
  }

  return { columns: [], rows: [] };
}

export function toCsv(columns: PublicTableColumn[], rows: Array<Record<string, unknown>>): string {
  const header = columns.map(column => csvCell(column.label)).join(',');
  const body = rows.map(row => columns.map(column => csvCell(row[column.key])).join(','));
  return [header, ...body].join('\n');
}

export function exportFileName(tile: PublicTileModel, format: PublicComponentExportFormat): string {
  const safeTitle = tile.element.title.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'component-data';
  return `${safeTitle}.${format === 'excel' ? 'xlsx' : 'csv'}`;
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

function exportColumnsForRows(tile: PublicTileModel): PublicTableColumn[] {
  const configuredColumns = tile.columns.filter(column => column.key);
  if (configuredColumns.length > 0) return configuredColumns;
  const keys = Array.from(new Set(tile.rows.flatMap(row => Object.keys(row))));
  return keys.map(key => ({ key, label: key }));
}

function csvCell(value: unknown): string {
  const formatted = formatCellValue(value);
  return `"${formatted.replace(/"/g, '""')}"`;
}
