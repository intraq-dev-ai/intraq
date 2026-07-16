<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DashboardElement } from '../../types';
import { loadVisualizationData, type VisualizationDataRequestContext } from '../../visualization/data';
import { visualizationSpecFromElement } from '../../visualization/spec';
import { tableViewModel } from '../../visualization/table-view-model';
import {
  buildExpansionElement,
  canExpandTableRow,
  expansionRequestContext,
  tableRowExpansionKey,
  type DashboardTableRowExpansionLevel
} from '../../visualization/table-row-expansion';
import type { DashboardTableColumn, DashboardTableModel, DashboardTableRow } from '../../visualization/view-model-types';
import DashboardTableCellRenderer from '../DashboardTableCellRenderer.vue';

const props = defineProps<{
  baseParameterValues?: Record<string, unknown> | undefined;
  levelIndex: number;
  levels: DashboardTableRowExpansionLevel[];
  ownerElement: DashboardElement;
  parentRow: DashboardTableRow;
  rootRow: DashboardTableRow;
  visualizationRequest?: VisualizationDataRequestContext | undefined;
}>();

const loading = ref(false);
const error = ref('');
const model = ref<DashboardTableModel | null>(null);
const expandedRowKeys = ref<Set<string>>(new Set());
const selectedTabIndex = ref(0);

const level = computed(() => props.levels[props.levelIndex] ?? null);
const tabLevels = computed(() => level.value?.tabs ?? []);
const activeLevel = computed(() => {
  if (tabLevels.value.length === 0) return level.value;
  return tabLevels.value[Math.min(selectedTabIndex.value, tabLevels.value.length - 1)] ?? tabLevels.value[0] ?? null;
});
const childLevels = computed(() => {
  const activeChildren = activeLevel.value?.children ?? [];
  return activeChildren.length > 0 ? activeChildren : props.levels.slice(props.levelIndex + 1);
});
const nextLevel = computed(() => childLevels.value[0] ?? null);
const columns = computed<DashboardTableColumn[]>(() => model.value?.columns ?? []);
const rows = computed<DashboardTableRow[]>(() => model.value?.rows ?? []);
const footerRows = computed<DashboardTableRow[]>(() => model.value?.footerRows ?? []);
const canExpandChildren = computed(() => Boolean(nextLevel.value));
const columnSpan = computed(() => Math.max(columns.value.length + (canExpandChildren.value ? 1 : 0), 1));
const emptyMessage = computed(() => activeLevel.value?.emptyMessage ?? 'No rows');
const showEmptyMessage = computed(() => activeLevel.value?.showEmptyMessage === true);
const hasRenderableTable = computed(() => columns.value.length > 0);
const tabStyle = computed(() => level.value?.tabStyle ?? 'buttons');
const tabSeparator = computed(() => level.value?.tabSeparator ?? '|');
const tabStyleVars = computed(() => ({
  ...(level.value?.tabColor ? { '--dashboard-table-expansion-tab-color': level.value.tabColor } : {}),
  ...(level.value?.tabHoverColor ? { '--dashboard-table-expansion-tab-hover-color': level.value.tabHoverColor } : {}),
  ...(level.value?.tabActiveColor ? { '--dashboard-table-expansion-tab-active-color': level.value.tabActiveColor } : {}),
  ...(level.value?.tabFontWeight ? { '--dashboard-table-expansion-tab-font-weight': level.value.tabFontWeight } : {}),
  ...(level.value?.tabActiveFontWeight ? { '--dashboard-table-expansion-tab-active-font-weight': level.value.tabActiveFontWeight } : {}),
  ...(level.value?.tabIndent ? { '--dashboard-table-expansion-tab-indent': level.value.tabIndent } : {})
}));
const contentStyleVars = computed(() => ({
  ...(level.value?.contentIndent ? { '--dashboard-table-expansion-content-indent': level.value.contentIndent } : {})
}));

watch(
  () => JSON.stringify({
    baseParameterValues: props.baseParameterValues,
    levelIndex: props.levelIndex,
    ownerId: props.ownerElement.id,
    parentRow: props.parentRow.raw,
    rootRow: props.rootRow.raw,
    visualizationRequest: props.visualizationRequest
  }),
  () => {
    expandedRowKeys.value = new Set();
    void loadRows();
  },
  { immediate: true }
);

watch(
  () => selectedTabIndex.value,
  () => {
    expandedRowKeys.value = new Set();
    void loadRows();
  }
);

async function loadRows(): Promise<void> {
  if (!activeLevel.value) return;
  const built = buildExpansionElement({
    level: activeLevel.value,
    ownerElement: props.ownerElement,
    parentRow: props.parentRow,
    rootRow: props.rootRow,
    runtimeParameterValues: props.baseParameterValues
  });
  if (!built) {
    model.value = { columns: [], rows: [] };
    error.value = 'Expansion is not configured.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const spec = visualizationSpecFromElement(built.element);
    const requestContext = expansionRequestContext(props.visualizationRequest, built.element.config?.parameterValues as Record<string, unknown> | undefined);
    const data = await loadVisualizationData(built.element, spec, [], {
      refresh: true,
      requestContext,
      rowLimit: built.rowLimit
    });
    model.value = tableViewModel(spec, data, built.element, built.rowLimit);
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Expansion request failed.';
    model.value = { columns: [], rows: [] };
  } finally {
    loading.value = false;
  }
}

function childKey(row: DashboardTableRow, index: number): string {
  return tableRowExpansionKey(row, index, activeLevel.value?.rowKeyField);
}

function isExpanded(row: DashboardTableRow, index: number): boolean {
  return expandedRowKeys.value.has(childKey(row, index));
}

function toggleRow(row: DashboardTableRow, index: number): void {
  const key = childKey(row, index);
  const next = new Set(expandedRowKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedRowKeys.value = next;
}

function childCanExpand(row: DashboardTableRow): boolean {
  return Boolean(nextLevel.value) && canExpandTableRow(row, nextLevel.value?.rowKeyField);
}

function cellColumn(index: number): DashboardTableColumn {
  return columns.value[index] ?? { key: `column-${index}`, label: '', cellType: 'text' };
}

function selectTab(index: number): void {
  selectedTabIndex.value = index;
}
</script>

<template>
  <div class="dashboard-table-expansion">
    <div
      v-if="tabLevels.length > 1"
      class="dashboard-table-expansion-tabs"
      :class="`dashboard-table-expansion-tabs--${tabStyle}`"
      :style="tabStyleVars"
      role="tablist"
    >
      <template v-for="(tab, index) in tabLevels" :key="`${ownerElement.id}-row-expansion-tab-${index}`">
        <span
          v-if="index > 0 && tabStyle === 'links'"
          class="dashboard-table-expansion-tab-separator"
          aria-hidden="true"
        >
          {{ tabSeparator }}
        </span>
        <button
          type="button"
          role="tab"
          :aria-selected="selectedTabIndex === index"
          :class="{ active: selectedTabIndex === index }"
          @click="selectTab(index)"
        >
          {{ tab.title || tab.controlColumnLabel || tab.tableName || `Tab ${index + 1}` }}
        </button>
      </template>
    </div>
    <div class="dashboard-table-expansion-content" :style="contentStyleVars">
      <div v-if="loading" class="dashboard-table-expansion-state">Loading...</div>
      <div v-else-if="error" class="dashboard-table-expansion-state">{{ error }}</div>
      <div v-else-if="!hasRenderableTable && showEmptyMessage" class="dashboard-table-expansion-state">{{ emptyMessage }}</div>
      <div v-else-if="!hasRenderableTable" class="dashboard-table-expansion-state" aria-hidden="true"></div>
      <table v-else class="dashboard-table-expansion-table" :aria-label="`${ownerElement.name} expanded rows`">
        <thead>
          <tr>
            <th v-if="canExpandChildren" scope="col" class="dashboard-table-control-cell">
              {{ nextLevel?.controlColumnLabel ?? '' }}
            </th>
            <th v-for="column in columns" :key="column.key" scope="col" :style="column.width ? { width: column.width } : undefined">
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0" class="dashboard-table-expansion-empty-row">
            <td :colspan="columnSpan" :aria-label="showEmptyMessage ? emptyMessage : undefined">
              <span v-if="showEmptyMessage">{{ emptyMessage }}</span>
            </td>
          </tr>
          <template v-for="(row, rowIndex) in rows" :key="childKey(row, rowIndex)">
            <tr>
              <td v-if="canExpandChildren" class="dashboard-table-control-cell">
                <button
                  v-if="childCanExpand(row)"
                  type="button"
                  class="dashboard-table-expansion-toggle"
                  :aria-expanded="isExpanded(row, rowIndex)"
                  :aria-label="`${isExpanded(row, rowIndex) ? 'Collapse' : 'Expand'} ${row.cells[0]?.display ?? 'row'}`"
                  @click="toggleRow(row, rowIndex)"
                >
                  <span aria-hidden="true">{{ isExpanded(row, rowIndex) ? '-' : '+' }}</span>
                </button>
              </td>
              <DashboardTableCellRenderer
                v-for="(cell, cellIndex) in row.cells"
                :key="`${childKey(row, rowIndex)}-${cellIndex}`"
                :cell="cell"
                :column="cellColumn(cellIndex)"
                :row="row"
                :row-index="rowIndex"
              />
            </tr>
            <tr v-if="isExpanded(row, rowIndex)" class="dashboard-table-expanded-row">
              <td :colspan="columnSpan">
                <DashboardTableExpansionTable
                  :base-parameter-values="baseParameterValues"
                  :level-index="0"
                  :levels="childLevels"
                  :owner-element="ownerElement"
                  :parent-row="row"
                  :root-row="rootRow"
                  :visualization-request="visualizationRequest"
                />
              </td>
            </tr>
          </template>
        </tbody>
        <tfoot v-if="footerRows.length > 0">
          <tr v-for="(row, rowIndex) in footerRows" :key="`footer-${childKey(row, rowIndex)}`" class="is-total dashboard-table-total-row">
            <td v-if="canExpandChildren" class="dashboard-table-control-cell is-total"></td>
            <DashboardTableCellRenderer
              v-for="(cell, cellIndex) in row.cells"
              :key="`footer-${row.key}-${cellIndex}`"
              :cell="cell"
              :column="cellColumn(cellIndex)"
              :row="row"
              :row-index="rowIndex"
            />
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
