<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { BuilderDataField, BuilderDataSource, BuilderDataTable, DashboardElement, DashboardFilter, DashboardFilterCreatePatch } from '../../types';
import { useManualSidebarContext } from './manualSidebarContext';
import { parameterFieldsForDataTable } from '../parameterized-data-sources';
import {
  fieldsForStaticDataSourceTarget,
  fieldsForStaticElementTarget,
  isRecord,
  newStaticCondition,
  readString,
  readStringArray,
  readStringRecord,
  readTargetFieldTypes,
  simpleStaticRuleFromFilter,
  staticFilterPatchFromDraft,
  staticRuleConditions,
  type StaticConditionDraft, type StaticRuleLogic, type StaticScope, type StaticTargetFieldType
} from './manualStaticFilterModel';
import StaticFilterRuleBuilder, { type FilterNode } from './StaticFilterRuleBuilder.vue';

const props = defineProps<{
  editingFilter: DashboardFilter | null;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => { dialogEl.value?.focus(); });

const ctx = useManualSidebarContext();
const activeTab = ref<'rules' | 'target'>('target');
const advancedMode = ref(false);
const advancedRulesText = ref('');
const validationMessage = ref('');
const filterName = ref('Static Filter');
const scope = ref<StaticScope>('dataSource');
const selectedDataSourceId = ref('');
const selectedComponentIds = ref<string[]>([]);
const targetFieldTypes = ref<Record<string, StaticTargetFieldType>>({});
const targetFieldMappings = ref<Record<string, string>>({});
const filterRules = ref<FilterNode>(emptyRuleTree());

const dashboardElements = computed(() => ctx.dashboard?.elements.filter(element => element.isVisible !== false) ?? []);
const selectedSource = computed(() => ctx.dataSources.find(source => source.id === selectedDataSourceId.value) ?? ctx.dataSources[0]);
const selectedTable = computed(() =>
  selectedSource.value?.tables.find(table => table.id === ctx.selectedTableId)
  ?? selectedSource.value?.tables.find(table => table.isSelected)
  ?? selectedSource.value?.tables[0]
);
const selectedComponent = computed(() => dashboardElements.value.find(element => element.id === selectedComponentIds.value[0]));
const availableFields = computed(() => {
  if (scope.value === 'component' && selectedComponent.value) {
    return fieldsForStaticElementTarget(selectedComponent.value, ctx.dataSources, selectedTable.value?.fields ?? []);
  }
  return selectedTable.value?.fields ?? [];
});
const selectedTargets = computed(() =>
  scope.value === 'component' ? selectedComponentIds.value : selectedDataSourceId.value ? [selectedDataSourceId.value] : []
);

watch(() => [props.open, props.editingFilter?.id], () => {
  if (props.open) loadDialog();
}, { immediate: true });

watch(advancedMode, enabled => {
  if (enabled) advancedRulesText.value = JSON.stringify(buildRules(), null, 2);
});

watch(selectedTargets, () => { ensureTargetMappings(); }, { deep: true });
watch(targetFieldTypes, () => { ensureTargetMappings(); }, { deep: true });

function emptyRuleTree(): FilterNode {
  return {
    id: 'root',
    type: 'group',
    logic: 'and',
    children: [{
      id: `cond_${Date.now()}`,
      type: 'condition',
      field: '',
      operator: 'equals',
      value: '',
      valueType: 'static',
      dynamicDateValue: 'today',
      dynamicDateOffset: 0
    }]
  };
}

function ruleTreeFromRecord(rules: Record<string, unknown>): FilterNode {
  const toNode = (raw: unknown): FilterNode | null => {
    if (!isRecord(raw)) return null;
    if (readString(raw.type) === 'condition') {
      const val = raw.value;
      return {
        id: readString(raw.id) ?? `cond_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        type: 'condition',
        field: readString(raw.field) ?? '',
        operator: readString(raw.operator) ?? 'equals',
        value: Array.isArray(val) ? String(val[0] ?? '') : String(val ?? ''),
        valueType: readString(raw.valueType) === 'dynamic' ? 'dynamic' : 'static',
        dynamicDateValue: readString(raw.dynamicDateValue) ?? 'today',
        dynamicDateOffset: typeof raw.dynamicDateOffset === 'number' ? raw.dynamicDateOffset : 0
      };
    }
    const children = Array.isArray(raw.children) ? raw.children.flatMap(c => { const n = toNode(c); return n ? [n] : []; }) : [];
    return {
      id: readString(raw.id) ?? 'root',
      type: 'group',
      logic: (readString(raw.logic) as FilterNode['logic']) ?? 'and',
      children
    };
  };
  return toNode(rules) ?? emptyRuleTree();
}

function loadDialog(): void {
  validationMessage.value = '';
  activeTab.value = 'target';
  const filter = props.editingFilter;
  if (!filter) {
    filterName.value = 'Static Filter';
    scope.value = 'dataSource';
    selectedDataSourceId.value = ctx.selectedDataSourceId || ctx.dataSources[0]?.id || '';
    selectedComponentIds.value = [];
    targetFieldTypes.value = {};
    targetFieldMappings.value = {};
    filterRules.value = emptyRuleTree();
    ensureTargetMappings();
    advancedMode.value = false;
    advancedRulesText.value = JSON.stringify(buildRules(), null, 2);
    return;
  }
  const config = filter.config ?? {};
  const targetComponents = readStringArray(config.targetComponents ?? config.targetElementIds);
  filterName.value = filter.name;
  scope.value = targetComponents.length > 0 ? 'component' : 'dataSource';
  selectedComponentIds.value = targetComponents;
  selectedDataSourceId.value = readString(config.targetDataSourceId)
    ?? readStringArray(config.targetDataSources)[0]
    ?? ctx.selectedDataSourceId
    ?? ctx.dataSources[0]?.id
    ?? '';
  targetFieldTypes.value = readTargetFieldTypes(config.targetFieldTypes);
  targetFieldMappings.value = {
    ...readStringRecord(config.dataSourceFieldMappings),
    ...readStringRecord(config.componentFieldMappings),
    ...readStringRecord(config.enhancedFieldMappings)
  };
  const savedRules = isRecord(config.rules) ? config.rules : simpleStaticRuleFromFilter(filter);
  filterRules.value = ruleTreeFromRecord(savedRules);
  ensureTargetMappings();
  advancedMode.value = false;
  advancedRulesText.value = JSON.stringify(savedRules, null, 2);
}

function saveStaticFilter(): void {
  validationMessage.value = '';
  const name = filterName.value.trim();
  if (!name) { validationMessage.value = 'Enter a static filter name.'; return; }
  if (scope.value === 'dataSource' && !selectedDataSourceId.value) {
    validationMessage.value = 'Select a target data source.';
    activeTab.value = 'target';
    return;
  }
  if (scope.value === 'component' && selectedComponentIds.value.length === 0) {
    validationMessage.value = 'Select at least one target component.';
    activeTab.value = 'target';
    return;
  }
  const rules = parseRulesForSave();
  if (!rules) return;
  const flatConditions = staticRuleConditions(rules);
  if (flatConditions.length === 0) {
    validationMessage.value = 'Add at least one filter condition.';
    activeTab.value = 'rules';
    return;
  }
  const firstCondition = flatConditions[0];
  if (!firstCondition?.field) {
    validationMessage.value = 'Select a field for every condition.';
    activeTab.value = 'rules';
    return;
  }
  ensureTargetMappings();
  const patch = staticFilterPatchFromDraft({
    firstCondition,
    name,
    rules,
    scope: scope.value,
    selectedComponentIds: selectedComponentIds.value,
    selectedDataSourceId: selectedDataSourceId.value,
    targetFieldMappings: targetFieldMappings.value,
    targetFieldTypes: targetFieldTypes.value
  });
  if (props.editingFilter) ctx.changeFilter(props.editingFilter.id, patch);
  else ctx.createFilter(patch as DashboardFilterCreatePatch);
  emit('close');
}

function parseRulesForSave(): Record<string, unknown> | null {
  if (!advancedMode.value) return buildRules();
  try {
    const parsed = JSON.parse(advancedRulesText.value) as unknown;
    if (isRecord(parsed)) return parsed;
  } catch {
    validationMessage.value = 'Static filter rules JSON is invalid.';
    activeTab.value = 'rules';
    return null;
  }
  validationMessage.value = 'Static filter rules JSON must be an object.';
  activeTab.value = 'rules';
  return null;
}

function buildRules(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(filterRules.value)) as Record<string, unknown>;
}

function toggleComponentTarget(id: string, checked: boolean): void {
  selectedComponentIds.value = checked
    ? Array.from(new Set([...selectedComponentIds.value, id]))
    : selectedComponentIds.value.filter(item => item !== id);
  ensureTargetMappings();
}

function ensureTargetMappings(): void {
  const fallbackField = staticRuleConditions(filterRules.value)[0]?.field || availableFields.value[0]?.name || '';
  for (const targetId of selectedTargets.value) {
    targetFieldTypes.value[targetId] ??= 'column';
    const fields = fieldsForTarget(targetId);
    const current = targetFieldMappings.value[targetId] ?? '';
    if (!current || (fields.length > 0 && !fields.some(field => field.name === current))) {
      targetFieldMappings.value[targetId] = firstFieldName(fields) || fallbackField;
    }
  }
}

function fieldsForTarget(targetId: string): BuilderDataField[] {
  if (targetFieldTypes.value[targetId] === 'parameter') {
    const { source, table } = dataSourceTableForTarget(targetId);
    return parameterFieldsForDataTable(source, table);
  }
  if (scope.value === 'component') {
    const element = dashboardElements.value.find(item => item.id === targetId);
    return element ? fieldsForStaticElementTarget(element, ctx.dataSources, selectedTable.value?.fields ?? []) : [];
  }
  return fieldsForStaticDataSourceTarget(targetId, ctx.dataSources, ctx.selectedTableId);
}

function dataSourceTableForTarget(targetId: string): { source?: BuilderDataSource; table?: BuilderDataTable } {
  if (scope.value === 'component') {
    const element = dashboardElements.value.find(item => item.id === targetId);
    return dataSourceTableForElement(element);
  }
  const source = ctx.dataSources.find(item => item.id === targetId);
  const table = tableForSource(source);
  return { ...(source ? { source } : {}), ...(table ? { table } : {}) };
}

function dataSourceTableForElement(element: DashboardElement | undefined): { source?: BuilderDataSource; table?: BuilderDataTable } {
  const sourceId = readString(element?.dataSourceId)
    ?? readString(element?.config?.dataSourceId)
    ?? readString(element?.config?.dataSource);
  const tableId = readString(element?.config?.dataSourceTableId)
    ?? readString(element?.config?.tableId)
    ?? readString(element?.config?.tableName);
  const source = ctx.dataSources.find(item => item.id === sourceId
    || item.tables.some(table => table.id === sourceId || table.name === sourceId || table.id === tableId || table.name === tableId));
  const table = tableForSource(source, tableId ?? sourceId);
  return { ...(source ? { source } : {}), ...(table ? { table } : {}) };
}

function tableForSource(source: BuilderDataSource | undefined, tableId = ctx.selectedTableId): BuilderDataTable | undefined {
  return source?.tables.find(table => table.id === tableId || table.name === tableId)
    ?? source?.tables.find(table => table.isSelected)
    ?? source?.tables[0];
}

function targetLabel(targetId: string): string {
  if (scope.value === 'component') {
    return dashboardElements.value.find(element => element.id === targetId)?.name ?? 'Selected component';
  }
  return ctx.dataSources.find(source => source.id === targetId)?.name ?? 'Selected data source';
}

function firstFieldName(fields: BuilderDataField[]): string {
  return fields[0]?.name ?? '';
}
</script>

<template>
  <div v-if="open" class="manual-modal-overlay" @click.self="emit('close')">
    <section
      ref="dialogEl"
      class="manual-modal static-filter-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Static Filter Editor"
      tabindex="-1"
      @keydown.esc="emit('close')"
    >
      <header class="manual-modal-header">
        <h4>{{ editingFilter ? 'Edit Static Filter' : 'Add Static Filter' }}</h4>
        <button type="button" class="modal-close" aria-label="Close static filter editor" @click="emit('close')">&times;</button>
      </header>

      <div class="manual-modal-body">
        <div class="sidebar-tabs config-tabs" role="tablist" aria-label="Static filter steps">
          <button type="button" :class="['tab-btn', { active: activeTab === 'target' }]" @click="activeTab = 'target'">Target</button>
          <button type="button" :class="['tab-btn', { active: activeTab === 'rules' }]" @click="activeTab = 'rules'">Filter Rules</button>
        </div>
        <p v-if="validationMessage" class="editor-config-error" role="alert">{{ validationMessage }}</p>

        <div v-if="activeTab === 'target'" class="static-filter-form">
          <label class="editor-field-label">Name<input v-model="filterName" class="editor-input" /></label>
          <label class="editor-field-label">Apply To
            <select v-model="scope" class="editor-select">
              <option value="dataSource">Data Source</option>
              <option value="component">Selected Components</option>
            </select>
          </label>
          <label v-if="scope === 'dataSource'" class="editor-field-label">Target Data Source
            <select v-model="selectedDataSourceId" class="editor-select">
              <option v-for="source in ctx.dataSources" :key="source.id" :value="source.id">{{ source.name }}</option>
            </select>
          </label>
          <div v-if="scope === 'dataSource' && selectedDataSourceId" class="static-target-mapping">
            <div class="section-header">Target Mapping</div>
            <label class="editor-field-label">Field Type
              <select v-model="targetFieldTypes[selectedDataSourceId]" class="editor-select">
                <option value="column">Column</option>
                <option value="parameter">Parameter</option>
              </select>
            </label>
            <label class="editor-field-label">Target Field
              <select v-model="targetFieldMappings[selectedDataSourceId]" class="editor-select">
                <option value="">Use rule field</option>
                <option v-for="field in fieldsForTarget(selectedDataSourceId)" :key="field.name" :value="field.name">{{ field.label || field.description || field.name }}</option>
              </select>
            </label>
          </div>
          <div v-else class="component-target-list">
            <label v-for="element in dashboardElements" :key="element.id" class="checkbox-row">
              <input type="checkbox" :checked="selectedComponentIds.includes(element.id)" @change="toggleComponentTarget(element.id, ($event.target as HTMLInputElement).checked)" />
              <span>{{ element.name }} <small>{{ element.chartType || element.type }}</small></span>
            </label>
            <div v-for="targetId in selectedComponentIds" :key="targetId" class="static-target-mapping">
              <div class="section-header">{{ targetLabel(targetId) }} Mapping</div>
              <label class="editor-field-label">Field Type
                <select v-model="targetFieldTypes[targetId]" class="editor-select">
                  <option value="column">Column</option>
                  <option value="parameter">Parameter</option>
                </select>
              </label>
              <label class="editor-field-label">Target Field
                <select v-model="targetFieldMappings[targetId]" class="editor-select">
                  <option value="">Use rule field</option>
                  <option v-for="field in fieldsForTarget(targetId)" :key="field.name" :value="field.name">{{ field.label || field.description || field.name }}</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div v-else class="static-filter-form">
          <div class="toggle-row">
            <span class="toggle-label">Advanced JSON Rules</span>
            <label class="toggle-switch">
              <input v-model="advancedMode" type="checkbox" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <template v-if="advancedMode">
            <textarea v-model="advancedRulesText" class="editor-input editor-textarea" rows="12"></textarea>
          </template>
          <template v-else>
            <StaticFilterRuleBuilder
              :rule="filterRules"
              :depth="0"
              :available-fields="availableFields"
              @update="filterRules = $event"
            />
          </template>
        </div>
      </div>

      <footer class="manual-modal-footer">
        <button type="button" class="modal-cancel-btn" @click="emit('close')">Cancel</button>
        <button type="button" class="manage-btn apply-btn" @click="saveStaticFilter">Save Static Filter</button>
      </footer>
    </section>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
