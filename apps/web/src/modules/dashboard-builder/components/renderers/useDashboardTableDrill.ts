import { computed, ref, type ComputedRef } from 'vue';
import type { DashboardTableCell, DashboardTableColumn, DashboardTableModel, DashboardTableRow } from '../../visualization/view-model-types';
import type { TableActionDialog, TableDrillState, TableRowActionPayload } from './dashboard-table-renderer-types';
import { isDashboardTableRow } from './dashboard-table-renderer-utils';

interface UseDashboardTableDrillParams {
  elementName: ComputedRef<string>;
  model: ComputedRef<DashboardTableModel>;
  onDrillChange: () => void;
}

export function useDashboardTableDrill(params: UseDashboardTableDrillParams) {
  const actionDialog = ref<TableActionDialog | null>(null);
  const drillState = ref<TableDrillState | null>(null);
  const displayColumns = computed(() => drillState.value ? drillDetailColumns() : params.model.value.columns);
  const sourceRows = computed(() => drillState.value ? drillDetailRows() : params.model.value.rows);

  function runRowAction(payload: TableRowActionPayload): void {
    const kind = payload.actionId.toLowerCase().includes('drill') || payload.label.toLowerCase().includes('drill') ? 'drill' : 'inspect';
    if (kind === 'drill') {
      drillIntoRow(payload);
      return;
    }
    openInspectAction(payload);
  }

  function drillIntoRow(payload: { row: unknown; rowIndex: number }): void {
    const row = isDashboardTableRow(payload.row) ? payload.row : null;
    const filter = row ? primaryDrillFilter(row) : undefined;
    if (!filter) return;
    const existingLevels = drillState.value?.levels ?? [];
    drillState.value = { ...filter, levels: [...existingLevels, filter], sourceRowIndex: payload.rowIndex };
    params.onDrillChange();
  }

  function clearDrill(): void {
    const levels = drillState.value?.levels ?? [];
    if (levels.length <= 1) {
      drillState.value = null;
    } else {
      const nextLevels = levels.slice(0, -1);
      const current = nextLevels[nextLevels.length - 1];
      drillState.value = current ? { ...current, levels: nextLevels, sourceRowIndex: 0 } : null;
    }
    params.onDrillChange();
  }

  function openInspectAction(payload: TableRowActionPayload): void {
    const row = isDashboardTableRow(payload.row) ? payload.row : null;
    const rows = row ? displayColumns.value.map((column, index) => ({
      field: column.key,
      label: column.label,
      value: row.cells[index]?.display ?? ''
    })) : [];
    actionDialog.value = {
      actionId: payload.actionId,
      label: payload.label,
      rowIndex: payload.rowIndex,
      rows,
      title: `${payload.label}: ${params.elementName.value}`
    };
  }

  function closeRowAction(): void {
    actionDialog.value = null;
  }

  function primaryDrillFilter(row: DashboardTableRow): { field: string; label: string; value: string } | undefined {
    const usedFields = new Set(drillState.value?.levels.map(level => level.field) ?? []);
    const candidates = displayColumns.value
      .map((column, index) => ({ cell: row.cells[index], column }))
      .filter((item): item is { cell: DashboardTableCell; column: DashboardTableColumn } => {
        const display = item.cell?.display.trim() ?? '';
        return item.column.cellType !== 'actions'
          && item.cell !== undefined
          && item.cell?.numeric == null
          && display.length > 0
          && hasRawDrillValue(row, item.column.key, display);
      });
    const unusedCandidates = candidates.filter(item => !usedFields.has(item.column.key));
    const drillableCandidates = unusedCandidates.length > 0 ? unusedCandidates : candidates;
    const preferred = drillableCandidates.find(item => /location|site|region|category|channel|center|name/i.test(item.column.key))
      ?? drillableCandidates[0];
    if (!preferred) return undefined;
    return { field: preferred.column.key, label: preferred.column.label, value: preferred.cell.display };
  }

  function drillDetailColumns(): DashboardTableColumn[] {
    const drill = drillState.value;
    if (!drill) return params.model.value.columns;
    const rows = matchingRawRows(drill);
    const rawKeys = new Set(rows.flatMap(row => Object.keys(row.raw ?? {})));
    const actionColumn = params.model.value.columns.find(column => column.cellType === 'actions');
    const contextKeys = drill.levels.map(level => level.field).filter((key, index, keys) => rawKeys.has(key) && keys.indexOf(key) === index);
    const orderedKeys = [
      'business_date',
      'revenue_center',
      'day_part',
      'order_channel',
      'category',
      'menu_item',
      'staff_name',
      'register_name',
      'net_sales',
      'order_count',
      'labor_pct',
      'score'
    ].filter(key => key !== drill.field && rawKeys.has(key));
    const extraKeys = Array.from(rawKeys)
      .filter(key => key !== drill.field && !orderedKeys.includes(key) && isUsefulDrillField(key))
      .slice(0, Math.max(0, 9 - contextKeys.length - orderedKeys.length));
    const columns = [...contextKeys, ...orderedKeys, ...extraKeys].slice(0, 10).map(key => drillColumnForKey(key));
    return actionColumn ? [...columns, actionColumn] : columns;
  }

  function drillDetailRows(): DashboardTableRow[] {
    const drill = drillState.value;
    if (!drill) return params.model.value.rows;
    const columns = drillDetailColumns();
    return matchingRawRows(drill).map((row, rowIndex) => ({
      key: `drill-${row.key || rowIndex}`,
      ...(row.raw ? { raw: row.raw } : {}),
      cells: columns.map(column => drillCell(row, column))
    }));
  }

  function matchingRawRows(drill: TableDrillState): DashboardTableRow[] {
    const rows = params.model.value.rows.filter(row => drill.levels.every(level => hasRawDrillValue(row, level.field, level.value)));
    return rows.length > 0 ? rows : params.model.value.rows;
  }

  function hasRawDrillValue(row: DashboardTableRow, field: string, value: string): boolean {
    if (!row.raw) return false;
    const rawValue = row.raw[field];
    return String(rawValue ?? '').trim().toLowerCase() === value.trim().toLowerCase();
  }

  function drillColumnForKey(key: string): DashboardTableColumn {
    const existing = params.model.value.columns.find(column => column.key === key);
    if (existing) return { ...existing, sortable: true };
    const format = formatForDrillField(key);
    return {
      key,
      label: labelFromField(key),
      cellType: 'text',
      sortable: true,
      ...(format ? { format } : {})
    };
  }

  function drillCell(row: DashboardTableRow, column: DashboardTableColumn): DashboardTableCell {
    if (column.cellType === 'actions') {
      return { display: '', numeric: null, ratio: null, raw: '', sparkline: [], tone: 'neutral' };
    }
    const raw = row.raw?.[column.key];
    const numeric = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    return {
      display: formatDrillValue(raw, column.key),
      numeric,
      ratio: null,
      raw,
      sparkline: [],
      tone: toneForDrillValue(numeric, column.key)
    };
  }

  return {
    actionDialog,
    clearDrill,
    closeRowAction,
    displayColumns,
    drillState,
    runRowAction,
    sourceRows
  };
}

function isUsefulDrillField(key: string): boolean {
  return !['id', '_id', 'spark_a', 'spark_b', 'spark_c'].includes(key) && !key.endsWith('_id');
}

function formatForDrillField(key: string): DashboardTableColumn['format'] | undefined {
  if (/sales|cost|revenue|profit|refund|discount|tax|ticket/i.test(key)) return 'currency';
  if (/pct|percent|rate|margin/i.test(key)) return 'percentage';
  if (/count|hours|minutes|score|qty/i.test(key)) return 'number';
  return undefined;
}

function formatDrillValue(value: unknown, key: string): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  const format = formatForDrillField(key);
  if (format === 'currency') return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (format === 'percentage') return `${(Math.abs(value) <= 1 ? value * 100 : value).toFixed(1)}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function toneForDrillValue(value: number | null, key: string): DashboardTableCell['tone'] {
  if (value === null) return 'neutral';
  if (/score|margin|satisfaction/i.test(key)) return value >= 80 || (value > 0 && value <= 1 && value >= 0.8) ? 'success' : value < 60 ? 'warning' : 'neutral';
  if (/refund|waste|variance/i.test(key)) return value > 0 ? 'warning' : 'neutral';
  return 'neutral';
}

function labelFromField(field: string): string {
  return field.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}
