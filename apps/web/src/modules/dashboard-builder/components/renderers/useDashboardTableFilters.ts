import { computed, ref, watch, type ComputedRef } from 'vue';
import type { DashboardTableColumn, DashboardTableRow } from '../../visualization/view-model-types';
import {
  filterTableRows,
  tableFilterOptions,
  type TableFilterState
} from '../../visualization/table-filter-runtime';
import { tableFilterDraftIsValid } from './dashboard-table-filter-helpers';
import type { TableFilterDraftState, TableFilterMode } from './dashboard-table-renderer-types';

interface UseDashboardTableFiltersParams {
  displayColumns: ComputedRef<DashboardTableColumn[]>;
  elementId: ComputedRef<string>;
  filtersEnabled: ComputedRef<boolean>;
  sourceRows: ComputedRef<DashboardTableRow[]>;
}

export function useDashboardTableFilters(params: UseDashboardTableFiltersParams) {
  const tableFilterDraft = ref<TableFilterDraftState>({
    caseSensitive: false,
    columnKey: '',
    mode: 'excel',
    operator: 'contains',
    query: '',
    secondaryQuery: '',
    selectedValues: [],
    valueSearch: ''
  });
  const openTableFilterColumnKey = ref<string | null>(null);
  const tableFilterPopoverStyle = ref<Record<string, string>>({});
  const tableFilters = ref<TableFilterState[]>([]);

  const openTableFilterOptions = computed(() =>
    tableFilterOptions(
      filterTableRows(params.sourceRows.value, params.displayColumns.value, tableFiltersWithoutColumn(tableFilterDraft.value.columnKey)),
      params.displayColumns.value,
      tableFilterDraft.value.columnKey
    )
  );
  const visibleTableFilterOptions = computed(() => {
    const query = tableFilterDraft.value.valueSearch.trim().toLowerCase();
    if (!query) return openTableFilterOptions.value;
    return openTableFilterOptions.value.filter(option => option.label.toLowerCase().includes(query));
  });
  const filteredTableRows = computed(() => filterTableRows(params.sourceRows.value, params.displayColumns.value, tableFilters.value));
  const allVisibleFilterOptionsSelected = computed(() =>
    visibleTableFilterOptions.value.length > 0
    && visibleTableFilterOptions.value.every(option => tableFilterDraft.value.selectedValues.includes(option.value))
  );
  const someVisibleFilterOptionsSelected = computed(() =>
    visibleTableFilterOptions.value.some(option => tableFilterDraft.value.selectedValues.includes(option.value))
    && !allVisibleFilterOptionsSelected.value
  );

  watch(() => params.displayColumns.value.map(column => column.key).join('|'), () => {
    const firstColumn = params.displayColumns.value[0]?.key ?? '';
    if (!params.displayColumns.value.some(column => column.key === tableFilterDraft.value.columnKey)) {
      resetTableFilterDraft(firstColumn, tableFilterDraft.value.mode);
    }
    tableFilters.value = tableFilters.value.filter(filter => params.displayColumns.value.some(column => column.key === filter.columnKey));
    if (openTableFilterColumnKey.value && !params.displayColumns.value.some(column => column.key === openTableFilterColumnKey.value)) {
      openTableFilterColumnKey.value = null;
      tableFilterPopoverStyle.value = {};
    }
  }, { immediate: true });

  watch(() => `${openTableFilterColumnKey.value ?? ''}:${openTableFilterOptions.value.map(option => option.value).join('|')}`, () => {
    if (!openTableFilterColumnKey.value || tableFilterDraft.value.mode !== 'excel') return;
    const available = new Set(openTableFilterOptions.value.map(option => option.value));
    const nextSelected = tableFilterDraft.value.selectedValues.filter(value => available.has(value));
    if (activeTableFilter(tableFilterDraft.value.columnKey) || nextSelected.length > 0 || available.size === 0) {
      tableFilterDraft.value.selectedValues = nextSelected;
      return;
    }
    tableFilterDraft.value.selectedValues = Array.from(available);
  });

  function activeTableFilter(columnKey: string): TableFilterState | undefined {
    return tableFilters.value.find(filter => filter.columnKey === columnKey);
  }

  function tableFiltersWithoutColumn(columnKey: string): TableFilterState[] {
    return tableFilters.value.filter(filter => filter.columnKey !== columnKey);
  }

  function resetTableFilterDraft(columnKey: string, mode: TableFilterMode = 'excel'): void {
    const options = tableFilterOptions(
      filterTableRows(params.sourceRows.value, params.displayColumns.value, tableFiltersWithoutColumn(columnKey)),
      params.displayColumns.value,
      columnKey
    );
    tableFilterDraft.value = {
      caseSensitive: false,
      columnKey,
      mode,
      operator: 'contains',
      query: '',
      secondaryQuery: '',
      selectedValues: options.map(option => option.value),
      valueSearch: ''
    };
  }

  function upsertTableFilter(next: TableFilterState): void {
    const filters = tableFiltersWithoutColumn(next.columnKey);
    tableFilters.value = [...filters, next];
  }

  function applyTableFilter(columnKey = tableFilterDraft.value.columnKey): void {
    if (tableFilterDraft.value.mode === 'excel') {
      const allValues = openTableFilterOptions.value.map(option => option.value);
      const selected = tableFilterDraft.value.selectedValues.filter((value, index, values) =>
        allValues.includes(value) && values.indexOf(value) === index
      );
      if (selected.length === allValues.length) {
        clearTableFilter(columnKey);
        return;
      }
      upsertTableFilter({ columnKey, selectedValues: selected });
      closeTableColumnFilter();
      return;
    }
    const operator = tableFilterDraft.value.operator ?? 'contains';
    const query = tableFilterDraft.value.query?.trim() ?? '';
    const secondaryQuery = tableFilterDraft.value.secondaryQuery?.trim() ?? '';
    if (tableFilterDraftIsValid(operator, query, secondaryQuery)) {
      upsertTableFilter({
        caseSensitive: tableFilterDraft.value.caseSensitive === true,
        columnKey,
        operator,
        query,
        secondaryQuery
      });
    } else if (activeTableFilter(columnKey)) {
      tableFilters.value = tableFiltersWithoutColumn(columnKey);
    }
    closeTableColumnFilter();
  }

  function clearTableFilter(columnKey = tableFilterDraft.value.columnKey): void {
    tableFilters.value = tableFiltersWithoutColumn(columnKey);
    resetTableFilterDraft(columnKey, tableFilterDraft.value.mode);
    closeTableColumnFilter();
  }

  function isTableColumnFilterable(column: DashboardTableColumn): boolean {
    return params.filtersEnabled.value && column.cellType !== 'actions';
  }

  function isTableColumnFilterOpen(column: DashboardTableColumn): boolean {
    return openTableFilterColumnKey.value === column.key;
  }

  function hasTableColumnFilter(column: DashboardTableColumn): boolean {
    return activeTableFilter(column.key) !== undefined;
  }

  function tableColumnFilterStatusText(column: DashboardTableColumn): string {
    if (!hasTableColumnFilter(column)) return '';
    return `${filteredTableRows.value.length} of ${params.sourceRows.value.length} rows match ${column.label}`;
  }

  function tableColumnFilterId(column: DashboardTableColumn): string {
    return `table-filter-${params.elementId.value}-${column.key}`;
  }

  function toggleTableColumnFilter(column: DashboardTableColumn, event: MouseEvent): void {
    if (openTableFilterColumnKey.value === column.key) {
      closeTableColumnFilter();
      return;
    }
    if (event.currentTarget instanceof HTMLElement) {
      tableFilterPopoverStyle.value = tableFilterPosition(event.currentTarget);
    }
    const activeFilter = activeTableFilter(column.key);
    const options = tableFilterOptions(
      filterTableRows(params.sourceRows.value, params.displayColumns.value, tableFiltersWithoutColumn(column.key)),
      params.displayColumns.value,
      column.key
    );
    tableFilterDraft.value = {
      caseSensitive: activeFilter?.caseSensitive === true,
      columnKey: column.key,
      mode: activeFilter
        ? (Array.isArray(activeFilter.selectedValues) ? 'excel' : 'advanced')
        : 'excel',
      operator: activeFilter?.operator ?? 'contains',
      query: activeFilter?.query ?? '',
      secondaryQuery: activeFilter?.secondaryQuery ?? '',
      selectedValues: Array.isArray(activeFilter?.selectedValues) ? [...activeFilter.selectedValues] : options.map(option => option.value),
      valueSearch: ''
    };
    openTableFilterColumnKey.value = column.key;
  }

  function closeTableColumnFilter(): void {
    openTableFilterColumnKey.value = null;
    tableFilterPopoverStyle.value = {};
  }

  function setTableFilterMode(mode: TableFilterMode): void {
    tableFilterDraft.value.mode = mode;
  }

  function setVisibleTableFilterOptionsSelected(checked: boolean): void {
    const visibleValues = visibleTableFilterOptions.value.map(option => option.value);
    const selected = new Set(tableFilterDraft.value.selectedValues);
    visibleValues.forEach(value => {
      if (checked) selected.add(value);
      else selected.delete(value);
    });
    tableFilterDraft.value.selectedValues = Array.from(selected);
  }

  function setTableFilterValueSelected(value: string, checked: boolean): void {
    const selected = new Set(tableFilterDraft.value.selectedValues);
    if (checked) selected.add(value);
    else selected.delete(value);
    tableFilterDraft.value.selectedValues = Array.from(selected);
  }

  function canClearTableFilter(columnKey: string): boolean {
    if (activeTableFilter(columnKey)) return true;
    if (tableFilterDraft.value.mode === 'advanced') return tableFilterDraftHasText();
    return tableFilterDraft.value.selectedValues.length !== openTableFilterOptions.value.length;
  }

  function tableFilterDraftHasText(): boolean {
    return (tableFilterDraft.value.query?.trim().length ?? 0) > 0 || (tableFilterDraft.value.secondaryQuery?.trim().length ?? 0) > 0;
  }

  return {
    allVisibleFilterOptionsSelected,
    applyTableFilter,
    canClearTableFilter,
    clearTableFilter,
    closeTableColumnFilter,
    filteredTableRows,
    hasTableColumnFilter,
    isTableColumnFilterable,
    isTableColumnFilterOpen,
    openTableFilterColumnKey,
    setTableFilterMode,
    setTableFilterValueSelected,
    setVisibleTableFilterOptionsSelected,
    someVisibleFilterOptionsSelected,
    tableColumnFilterId,
    tableColumnFilterStatusText,
    tableFilterDraft,
    tableFilterPopoverStyle,
    tableFilters,
    toggleTableColumnFilter,
    visibleTableFilterOptions
  };
}

function tableFilterPosition(anchor: HTMLElement): Record<string, string> {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const width = Math.min(280, window.innerWidth - margin * 2);
  const estimatedHeight = 320;
  const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
  const opensAbove = rect.bottom + gap + estimatedHeight > window.innerHeight - margin;
  const top = opensAbove ? Math.max(margin, rect.top - estimatedHeight - gap) : rect.bottom + gap;
  return {
    '--dashboard-table-filter-left': `${left}px`,
    '--dashboard-table-filter-top': `${top}px`,
    '--dashboard-table-filter-width': `${width}px`
  };
}
