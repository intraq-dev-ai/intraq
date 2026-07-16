<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  cardLayoutOptions,
  colorSchemeOptions,
  displayModeOptions,
  exportButtonStyleOptions,
  filterDisplayModeOptions,
  legendPositionOptions,
  tableFormatOptions,
  titlePositionOptions,
  type ComponentSettingsPatch
} from './component-info-dialog-options';
import {
  type DashboardComponentInfoDialogProps,
  useDashboardComponentInfoDialog
} from './useDashboardComponentInfoDialog';

const props = defineProps<DashboardComponentInfoDialogProps>();
const emit = defineEmits<{
  close: [];
  save: [elementId: string, patch: ComponentSettingsPatch];
}>();
const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => { dialogEl.value?.focus(); });

const {
  activeTab,
  activeTabLabel,
  availableChartTypeOptions,
  componentKind,
  draft,
  error,
  exportTargetOptions,
  hasSortingTab,
  moveFieldDown,
  moveFieldUp,
  removeField,
  saveDraft,
  settingsRows,
  sortableFieldOptions,
  supportsViewActions,
  tableFields,
  updateBoolean,
  visibleTabs
} = useDashboardComponentInfoDialog(props, {
  onClose: () => emit('close'),
  onSave: (elementId, patch) => emit('save', elementId, patch)
});
</script>

<template>
  <div v-if="element && summary" class="filter-editor-modal">
    <div class="modal-backdrop" @click="emit('close')" />
    <section
      ref="dialogEl"
      class="component-info-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`Component settings for ${element.name}`"
      tabindex="-1"
      @keydown.esc="emit('close')"
    >
      <div class="modal-header component-info-header">
        <div>
          <p class="component-info-kicker">{{ element.type }}</p>
          <h3>{{ element.name }}</h3>
        </div>
        <button type="button" class="close-btn" aria-label="Close component settings" @click="emit('close')">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="component-info-body">
        <div class="tab-navigation component-info-tabs" role="tablist" aria-label="Component settings tabs">
          <button
            v-for="tab in visibleTabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :class="['tab-button', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <div v-if="activeTab === 'filters'" class="component-info-panel">
          <div v-if="summary.filters.length === 0" class="component-info-empty">No filters apply to this component.</div>
          <div v-for="filter in summary.filters" :key="filter.id" class="component-info-row">
            <span>{{ filter.name }}</span>
            <strong>{{ filter.field }}</strong>
          </div>
        </div>

        <div v-else-if="activeTab === 'fields' && componentKind === 'export'" class="component-info-form">
          <label>Target component
            <select v-model="draft.exportTargetElementId">
              <option value="">Select a component</option>
              <option v-for="option in exportTargetOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label>Export format
            <select v-model="draft.exportFormat">
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </div>

        <div v-else-if="activeTab === 'fields'" class="component-info-form">
          <div v-if="tableFields.length === 0" class="component-info-empty component-info-wide">No {{ activeTabLabel.toLowerCase() }} configured.</div>
          <table v-else class="component-info-field-table component-info-wide" :aria-label="`Editable ${activeTabLabel.toLowerCase()} values`">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Field Name</th>
                <th scope="col">Display Name</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(field, index) in tableFields" :key="field.columnName">
                <td>
                  <div class="component-info-order-actions">
                    <button type="button" :disabled="index === 0" :aria-label="`Move ${field.columnName} up`" @click="moveFieldUp(index)">Up</button>
                    <button type="button" :disabled="index === tableFields.length - 1" :aria-label="`Move ${field.columnName} down`" @click="moveFieldDown(index)">Down</button>
                  </div>
                </td>
                <td><code>{{ field.columnName }}</code></td>
                <td>
                  <input
                    v-model="field.displayName"
                    :aria-label="`Display name for ${field.columnName}`"
                    :placeholder="field.columnName"
                  >
                </td>
                <td>
                  <button type="button" class="component-info-remove-btn" :aria-label="`Remove ${field.columnName}`" @click="removeField(index)">Remove</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="activeTab === 'formatting'" class="component-info-form">
          <div v-if="componentKind === 'card'" class="component-info-row component-info-row--compact">
            <span>Card formatting</span>
            <strong>{{ draft.colorScheme || 'default' }}</strong>
          </div>
          <div v-else class="component-info-row component-info-row--compact">
            <span>Conditional formatting rules</span>
            <strong>{{ summary.conditionalFormattingCount }}</strong>
          </div>
        </div>

        <div v-else-if="activeTab === 'sorting' && hasSortingTab" class="component-info-form">
          <label>Sort by
            <select v-model="draft.sortBy">
              <option value="">None</option>
              <option v-for="field in sortableFieldOptions" :key="field.value" :value="field.value">
                {{ field.label }} ({{ field.value }})
              </option>
            </select>
          </label>
          <label>Direction
            <select v-model="draft.sortDirection">
              <option value="">Default</option>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          <div v-if="settingsRows.length === 0" class="component-info-empty">No sorting settings configured.</div>
        </div>

        <div v-else-if="activeTab === 'layout' && componentKind === 'export'" class="component-info-form">
          <label>Button label <input v-model="draft.exportButtonLabel" placeholder="Export"></label>
          <label>Button style
            <select v-model="draft.exportButtonStyle">
              <option v-for="option in exportButtonStyleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>Alignment
            <select v-model="draft.exportAlign">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label class="component-info-checkbox"><input v-model="draft.exportShowIcon" type="checkbox"> Show icon</label>
          <label>Background color <input v-model="draft.exportButtonBackgroundColor" placeholder="#076715"></label>
          <label>Text color <input v-model="draft.exportButtonTextColor" placeholder="#ffffff"></label>
          <label>Border color <input v-model="draft.exportButtonBorderColor" placeholder="transparent"></label>
          <label>Border radius <input v-model="draft.exportButtonBorderRadius" placeholder="4px"></label>
        </div>

        <div v-else-if="activeTab === 'layout'" class="component-info-form">
          <label v-if="componentKind === 'table'">Table format
            <select v-model="draft.tableFormat">
              <option v-for="format in tableFormatOptions" :key="format.value" :value="format.value">{{ format.label }}</option>
            </select>
          </label>
          <label v-if="componentKind === 'table' || componentKind === 'matrix' || componentKind === 'filter'">Display mode
            <select v-model="draft.displayMode">
              <template v-if="componentKind === 'filter'">
                <option v-for="option in filterDisplayModeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </template>
              <template v-else>
                <option v-for="option in displayModeOptions" :key="option || 'default-display'" :value="option">{{ option || 'Default' }}</option>
              </template>
            </select>
          </label>
          <label v-if="componentKind === 'filter'">Background color
            <input v-model="draft.componentBackgroundColor" placeholder="#ffffff">
          </label>
          <label v-if="componentKind === 'card'">Card layout
            <select v-model="draft.cardLayout">
              <option v-for="option in cardLayoutOptions" :key="option.value || 'default-card-layout'" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>Title position
            <select v-model="draft.titlePosition">
              <option v-for="option in titlePositionOptions" :key="option || 'default-title'" :value="option">{{ option || 'Default' }}</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart'">Legend position
            <select v-model="draft.legendPosition">
              <option v-for="option in legendPositionOptions" :key="option || 'default-legend'" :value="option">{{ option || 'Default' }}</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart'">Legend marker
            <select v-model="draft.legendMarkerStyle">
              <option value="">Default</option>
              <option value="box">Box</option>
              <option value="line-marker">Line marker</option>
              <option value="point">Point</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart'">Line style
            <select v-model="draft.lineInterpolation">
              <option value="curved">Curved</option>
              <option value="straight">Straight</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart'">Curve tension <input v-model="draft.lineTension" inputmode="decimal" placeholder="0.35"></label>
          <label v-if="componentKind === 'chart'" class="settings-check">
            <input :checked="draft.fillMissingTimeBuckets" type="checkbox" @change="updateBoolean('fillMissingTimeBuckets', $event)">
            Fill missing time buckets
          </label>
          <label v-if="componentKind === 'chart' && draft.fillMissingTimeBuckets">Bucket interval
            <select v-model="draft.timeBucketInterval">
              <option value="auto">Auto from period filter</option>
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart' && draft.fillMissingTimeBuckets">Missing bucket value <input v-model="draft.timeBucketFillValue" inputmode="decimal" placeholder="0"></label>
          <label v-if="componentKind === 'chart'">Y axis start
            <select v-model="draft.yAxisStartMode">
              <option value="zero">Start at 0</option>
              <option value="auto">Auto</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart'">Y axis padding
            <select v-model="draft.yAxisPaddingMode">
              <option value="none">Default</option>
              <option value="auto">Auto padding</option>
              <option value="zero-centered">Zero-centered</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart'">Y padding ratio <input v-model="draft.yAxisPaddingRatio" inputmode="decimal" placeholder="0.5"></label>
          <label v-if="componentKind === 'chart'">Mixed-axis primary headroom <input v-model="draft.mixedAxisPrimaryHeadroomRatio" inputmode="decimal" placeholder="0.6"></label>
          <label v-if="componentKind === 'chart'">Y2 axis start
            <select v-model="draft.y2AxisStartMode">
              <option value="zero">Start at 0</option>
              <option value="auto">Auto</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart'">Y2 axis padding
            <select v-model="draft.y2AxisPaddingMode">
              <option value="none">Default</option>
              <option value="auto">Auto padding</option>
              <option value="zero-centered">Zero-centered</option>
            </select>
          </label>
          <label v-if="componentKind === 'chart'">Y2 padding ratio <input v-model="draft.y2AxisPaddingRatio" inputmode="decimal" placeholder="0.5"></label>
          <label v-if="componentKind === 'card'">Grid columns <input v-model="draft.gridColumns" inputmode="numeric"></label>
          <label v-if="componentKind === 'table'" class="component-info-check"><input type="checkbox" :checked="draft.showBorders" @change="updateBoolean('showBorders', $event)"> Show borders</label>
          <label v-if="componentKind === 'matrix'" class="component-info-check"><input type="checkbox" :checked="draft.showRowTotals" @change="updateBoolean('showRowTotals', $event)"> Row totals</label>
          <label v-if="componentKind === 'matrix'" class="component-info-check"><input type="checkbox" :checked="draft.showColumnTotals" @change="updateBoolean('showColumnTotals', $event)"> Column totals</label>
          <label v-if="componentKind === 'matrix'" class="component-info-check"><input type="checkbox" :checked="draft.showRowSubtotals" @change="updateBoolean('showRowSubtotals', $event)"> Row subtotals</label>
          <label v-if="componentKind === 'matrix'" class="component-info-check"><input type="checkbox" :checked="draft.showColumnSubtotals" @change="updateBoolean('showColumnSubtotals', $event)"> Column subtotals</label>
          <label v-if="componentKind === 'matrix'" class="component-info-check"><input type="checkbox" :checked="draft.showValueHeaders" @change="updateBoolean('showValueHeaders', $event)"> Value headers</label>
          <label v-if="componentKind === 'matrix'" class="component-info-check"><input type="checkbox" :checked="draft.showBorders" @change="updateBoolean('showBorders', $event)"> Borders</label>
        </div>

        <div v-else class="component-info-form">
          <label>Title <input v-model="draft.title" placeholder="Component title"></label>
          <label v-if="componentKind === 'chart'">Chart type
            <select v-model="draft.chartType">
              <option v-for="chartType in availableChartTypeOptions" :key="chartType" :value="chartType">{{ chartType }}</option>
            </select>
          </label>
          <label v-if="componentKind === 'card'">Color scheme
            <select v-model="draft.colorScheme">
              <option v-for="option in colorSchemeOptions" :key="option || 'default-color'" :value="option">{{ option || 'Default' }}</option>
            </select>
          </label>
          <label v-if="componentKind === 'table'">Rows per page <input v-model="draft.rowsPerPage" inputmode="numeric"></label>
          <label v-if="componentKind === 'table' || componentKind === 'chart'">Top N <input v-model="draft.topN" inputmode="numeric"></label>
          <label v-if="componentKind === 'table'" class="component-info-check"><input type="checkbox" :checked="draft.enableSearch" @change="updateBoolean('enableSearch', $event)"> Search</label>
          <label v-if="componentKind === 'table'" class="component-info-check"><input type="checkbox" :checked="draft.enableFilters" @change="updateBoolean('enableFilters', $event)"> Filters</label>
          <label v-if="componentKind === 'table'" class="component-info-check"><input type="checkbox" :checked="draft.enableSorting" @change="updateBoolean('enableSorting', $event)"> Sorting</label>
          <label v-if="componentKind === 'table'" class="component-info-check"><input type="checkbox" :checked="draft.enableExport" @change="updateBoolean('enableExport', $event)"> Export</label>
          <label v-if="componentKind === 'table'" class="component-info-check"><input type="checkbox" :checked="draft.enablePagination" @change="updateBoolean('enablePagination', $event)"> Pagination</label>
          <label v-if="componentKind === 'chart'" class="component-info-check"><input type="checkbox" :checked="draft.showLegend" @change="updateBoolean('showLegend', $event)"> Legend</label>
          <label v-if="componentKind === 'chart'" class="component-info-check"><input type="checkbox" :checked="draft.showGrid" @change="updateBoolean('showGrid', $event)"> Grid</label>
          <label v-if="componentKind === 'chart'" class="component-info-check"><input type="checkbox" :checked="draft.showDataLabels" @change="updateBoolean('showDataLabels', $event)"> Data labels</label>
          <label v-if="componentKind === 'chart'" class="component-info-check"><input type="checkbox" :checked="draft.stackBars" @change="updateBoolean('stackBars', $event)"> Stack bars</label>
          <label v-if="componentKind === 'table'" class="component-info-check"><input type="checkbox" :checked="draft.showTotal" @change="updateBoolean('showTotal', $event)"> Show total</label>
          <label v-if="componentKind === 'card'" class="component-info-check"><input type="checkbox" :checked="draft.showTrend" @change="updateBoolean('showTrend', $event)"> Trend</label>
          <label v-if="componentKind === 'card'" class="component-info-check"><input type="checkbox" :checked="draft.showIndicator" @change="updateBoolean('showIndicator', $event)"> Indicator</label>
          <label v-if="componentKind === 'card'" class="component-info-check"><input type="checkbox" :checked="draft.showSparkline" @change="updateBoolean('showSparkline', $event)"> Sparkline</label>
          <label v-if="supportsViewActions" class="component-info-check"><input type="checkbox" :checked="draft.showDownloadAction" @change="updateBoolean('showDownloadAction', $event)"> Download action</label>
          <label v-if="supportsViewActions" class="component-info-check"><input type="checkbox" :checked="draft.showExpandAction" @change="updateBoolean('showExpandAction', $event)"> Expand action</label>
        </div>

        <p v-if="error" class="component-info-error" role="alert">{{ error }}</p>
      </div>

      <div class="modal-footer">
        <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
        <button type="button" class="save-btn" @click="saveDraft">Apply changes</button>
      </div>
    </section>
  </div>
</template>
