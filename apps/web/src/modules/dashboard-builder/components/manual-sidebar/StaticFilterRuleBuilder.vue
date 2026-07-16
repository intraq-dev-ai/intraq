<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BuilderDataField } from '../../types';

export interface FilterNode {
  id: string;
  type: 'group' | 'condition';
  logic?: 'and' | 'or' | 'not';
  children?: FilterNode[];
  field?: string;
  operator?: string;
  value?: string;
  valueType?: 'static' | 'dynamic';
  dynamicDateValue?: string;
  dynamicDateOffset?: number;
}

const props = withDefaults(defineProps<{
  rule: FilterNode;
  depth?: number;
  availableFields?: BuilderDataField[];
}>(), {
  depth: 0,
  availableFields: () => []
});

const emit = defineEmits<{
  update: [node: FilterNode];
  remove: [];
}>();

const ensureDefaults = (node: FilterNode): FilterNode => {
  if (node.type === 'condition') {
    return {
      valueType: 'static',
      dynamicDateValue: 'today',
      dynamicDateOffset: 0,
      ...node
    };
  }
  if (node.type === 'group' && Array.isArray(node.children)) {
    return { ...node, children: node.children.map(ensureDefaults) };
  }
  return node;
};

const localRule = ref<FilterNode>(ensureDefaults(JSON.parse(JSON.stringify(props.rule))));

watch(() => props.rule, (newRule) => {
  localRule.value = ensureDefaults(JSON.parse(JSON.stringify(newRule)));
}, { deep: true });

const regularFields = computed(() => props.availableFields.filter(f => !(f as any).isCalculated));
const calculatedFields = computed(() => props.availableFields.filter(f => (f as any).isCalculated));

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function addCondition(): void {
  localRule.value.children ??= [];
  localRule.value.children.push({
    id: `cond_${uid()}`,
    type: 'condition',
    field: '',
    operator: 'equals',
    value: '',
    valueType: 'static',
    dynamicDateValue: 'today',
    dynamicDateOffset: 0
  });
  emitChange();
}

function addGroup(): void {
  localRule.value.children ??= [];
  localRule.value.children.push({
    id: `group_${uid()}`,
    type: 'group',
    logic: 'and',
    children: []
  });
  emitChange();
}

function removeChild(index: number): void {
  localRule.value.children?.splice(index, 1);
  emitChange();
}

function updateChild(index: number, updatedChild: FilterNode): void {
  if (localRule.value.children) {
    localRule.value.children[index] = updatedChild;
    emitChange();
  }
}

function emitChange(): void {
  emit('update', localRule.value);
}

function needsValue(operator: string): boolean {
  return !['is_null', 'is_not_null', 'is_blank', 'is_not_blank'].includes(operator);
}

function getValuePlaceholder(operator: string): string {
  const map: Record<string, string> = {
    in: 'value1, value2, value3',
    not_in: 'value1, value2, value3',
    between: 'start, end',
    contains: 'text to search',
    not_contains: 'text to exclude',
    starts_with: 'prefix',
    ends_with: 'suffix'
  };
  return map[operator] ?? 'Enter value';
}

function isDateField(fieldName: string): boolean {
  if (!fieldName) return false;
  const field = props.availableFields.find(f => f.name === fieldName);
  if (!field) return false;
  const dateTypes = ['date', 'datetime', 'timestamp'];
  if (dateTypes.includes((field.type ?? '').toLowerCase())) return true;
  const dateKeywords = ['date', 'time', 'created', 'updated', 'modified'];
  return dateKeywords.some(k => fieldName.toLowerCase().includes(k));
}

function onValueTypeChange(child: FilterNode): void {
  if (child.valueType === 'dynamic') {
    child.dynamicDateValue ??= 'today';
    child.dynamicDateOffset ??= 0;
  }
  emitChange();
}
</script>

<template>
  <div class="sfr-builder">
    <div class="sfr-group" :class="`sfr-depth-${depth}`">
      <div class="sfr-group-header">
        <select v-model="localRule.logic" class="sfr-logic-select" @change="emitChange">
          <option value="and">AND — All conditions</option>
          <option value="or">OR — Any condition</option>
          <option value="not">NOT — Negate first</option>
        </select>
        <div class="sfr-group-actions">
          <button type="button" class="sfr-action-btn sfr-add-cond" title="Add Condition" @click="addCondition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 4v16M4 12h16"/></svg>
            <span class="sfr-btn-text">Add Condition</span>
          </button>
          <button type="button" class="sfr-action-btn sfr-add-group" title="Add Group" @click="addGroup">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/></svg>
            <span class="sfr-btn-text">Add Group</span>
          </button>
          <button v-if="depth > 0" type="button" class="sfr-action-btn sfr-remove-group" title="Remove Group" @click="emit('remove')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div class="sfr-children">
        <template v-for="(child, index) in localRule.children ?? []" :key="child.id">
          <!-- Condition row -->
          <div v-if="child.type === 'condition'" class="sfr-condition">
            <select v-model="child.field" class="sfr-select sfr-field" @change="emitChange">
              <option value="">— Field —</option>
              <optgroup v-if="regularFields.length" label="Fields">
                <option v-for="f in regularFields" :key="f.name" :value="f.name">{{ f.label || f.description || f.name }}</option>
              </optgroup>
              <optgroup v-if="calculatedFields.length" label="Calculated">
                <option v-for="f in calculatedFields" :key="f.name" :value="f.name">{{ f.label || f.description || f.name }}</option>
              </optgroup>
            </select>

            <select v-model="child.operator" class="sfr-select sfr-operator" @change="emitChange">
              <option value="">— Operator —</option>
              <option value="equals">Equals</option>
              <option value="not_equals">Not Equals</option>
              <option value="greater_than">Greater Than</option>
              <option value="less_than">Less Than</option>
              <option value="greater_than_or_equal">≥ Greater or Equal</option>
              <option value="less_than_or_equal">≤ Less or Equal</option>
              <option value="contains">Contains</option>
              <option value="not_contains">Not Contains</option>
              <option value="starts_with">Starts With</option>
              <option value="ends_with">Ends With</option>
              <option value="in">In List</option>
              <option value="not_in">Not In List</option>
              <option value="between">Between</option>
              <option value="last">Last Window</option>
              <option value="is_null">Is Empty</option>
              <option value="is_not_null">Is Not Empty</option>
              <option value="is_blank">Is Blank</option>
              <option value="is_not_blank">Is Not Blank</option>
            </select>

            <template v-if="needsValue(child.operator ?? '')">
              <!-- Show value-type toggle only for date fields -->
              <select
                v-if="isDateField(child.field ?? '')"
                v-model="child.valueType"
                class="sfr-select sfr-value-type"
                @change="onValueTypeChange(child)"
              >
                <option value="static">Static</option>
                <option value="dynamic">Dynamic Date</option>
              </select>

              <!-- Dynamic date picker -->
              <template v-if="child.valueType === 'dynamic' && isDateField(child.field ?? '')">
                <select v-model="child.dynamicDateValue" class="sfr-select sfr-dynamic" @change="emitChange">
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="start_of_week">Start of Week</option>
                  <option value="end_of_week">End of Week</option>
                  <option value="start_of_month">Start of Month</option>
                  <option value="end_of_month">End of Month</option>
                  <option value="start_of_year">Start of Year</option>
                  <option value="end_of_year">End of Year</option>
                  <option value="last_7_days">Last 7 Days</option>
                  <option value="last_30_days">Last 30 Days</option>
                  <option value="last_90_days">Last 90 Days</option>
                  <option value="last_n_days">Last N Days</option>
                  <option value="last_year">Last Year</option>
                </select>
                <input
                  v-if="child.dynamicDateValue === 'last_n_days'"
                  v-model.number="child.dynamicDateOffset"
                  type="number"
                  class="sfr-offset"
                  placeholder="Days"
                  min="1"
                  @input="emitChange"
                />
              </template>

              <!-- Static value -->
              <input
                v-else
                v-model="child.value"
                type="text"
                class="sfr-value"
                :placeholder="getValuePlaceholder(child.operator ?? '')"
                @input="emitChange"
              />
            </template>

            <button type="button" class="sfr-remove-cond" title="Remove condition" @click="removeChild(index)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Nested group -->
          <StaticFilterRuleBuilder
            v-else-if="child.type === 'group'"
            :rule="child"
            :depth="(depth ?? 0) + 1"
            :available-fields="availableFields"
            @update="updateChild(index, $event)"
            @remove="removeChild(index)"
          />
        </template>

        <div v-if="!(localRule.children ?? []).length" class="sfr-empty">
          No conditions yet — click <strong>Add Condition</strong> to start.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sfr-builder { width: 100%; }

.sfr-group {
  border: 2px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  background: var(--surface, #fff);
}

.sfr-depth-0 { border-color: #8b5cf6; background: #faf5ff; }
.sfr-depth-1 { border-color: #3b82f6; background: #eff6ff; }
.sfr-depth-2 { border-color: #10b981; background: #f0fdf4; }
.sfr-depth-3 { border-color: #f59e0b; background: #fffbeb; }

.sfr-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
}

.sfr-logic-select {
  padding: 5px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  background: #fff;
  cursor: pointer;
}

.sfr-group-actions {
  display: flex;
  gap: 5px;
  margin-left: auto;
}

.sfr-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border: 1px solid currentColor;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: #fff;
  transition: background 0.15s, color 0.15s;
}

.sfr-add-cond { color: #8b5cf6; }
.sfr-add-cond:hover { background: #8b5cf6; color: #fff; }
.sfr-add-group { color: #3b82f6; }
.sfr-add-group:hover { background: #3b82f6; color: #fff; }
.sfr-remove-group { color: #ef4444; padding: 5px; }
.sfr-remove-group:hover { background: #ef4444; color: #fff; }

.sfr-btn-text { display: none; }
@media (min-width: 560px) { .sfr-btn-text { display: inline; } }

.sfr-children { display: flex; flex-direction: column; gap: 6px; }

.sfr-condition {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.sfr-select, .sfr-value, .sfr-offset {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}

.sfr-select:focus, .sfr-value:focus, .sfr-offset:focus {
  outline: none;
  border-color: #8b5cf6;
  box-shadow: 0 0 0 3px rgba(139,92,246,0.12);
}

.sfr-field { flex: 1.5; min-width: 130px; }
.sfr-operator { flex: 1.2; min-width: 120px; }
.sfr-value-type { flex: 0 0 100px; }
.sfr-dynamic { flex: 1; min-width: 130px; }
.sfr-value { flex: 1; min-width: 120px; }
.sfr-offset { width: 80px; flex: 0 0 80px; }

.sfr-remove-cond {
  padding: 6px;
  background: #fee2e2;
  color: #ef4444;
  border: 1px solid #fecaca;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.sfr-remove-cond:hover { background: #fecaca; }

.sfr-empty {
  padding: 20px;
  text-align: center;
  border: 2px dashed #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  color: #6b7280;
  font-size: 13px;
}
</style>
