<script setup lang="ts">
import { ref } from 'vue';
import { ADMIN_DATA_SOURCE_FILTER_OPERATORS } from '../workflow-helpers';
import type { AdminDataSourceFilterCondition } from '../types';

const props = defineProps<{
  availableFields: string[];
  error: string;
  isSaving: boolean;
  modelValue: AdminDataSourceFilterCondition[];
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [];
  'update:modelValue': [value: AdminDataSourceFilterCondition[]];
}>();

const nextDraftFilterId = ref(1);

function addCondition(): void {
  emit('update:modelValue', [
    ...props.modelValue,
    { id: `filter-draft-${nextDraftFilterId.value++}`, column: '', operator: '=', value: '', logicOperator: 'AND' }
  ]);
}

function removeCondition(index: number): void {
  emit('update:modelValue', props.modelValue.filter((_, candidateIndex) => candidateIndex !== index));
}

function updateCondition(
  index: number,
  key: keyof AdminDataSourceFilterCondition,
  value: string
): void {
  emit('update:modelValue', props.modelValue.map((condition, candidateIndex) =>
    candidateIndex === index ? { ...condition, [key]: key === 'logicOperator' ? value === 'OR' ? 'OR' : 'AND' : value } : condition
  ));
}

function fieldOptions(condition: AdminDataSourceFilterCondition): string[] {
  return condition.column && !props.availableFields.includes(condition.column)
    ? [condition.column, ...props.availableFields]
    : props.availableFields;
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ? event.target.value : '';
}
</script>

<template>
  <div v-if="open" class="admin-modal-overlay" @click.self="emit('close')">
    <section class="admin-modal admin-ds-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-ds-filter-dialog-title" tabindex="-1" @keydown.esc="emit('close')" @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()">
      <header class="admin-modal-header">
        <div>
          <p class="admin-modal-eyebrow">Filters</p>
          <h2 id="admin-ds-filter-dialog-title">{{ title }}</h2>
          <p class="admin-muted">Configure source and table filter conditions from discovered columns.</p>
        </div>
        <button class="admin-icon-button" type="button" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <div class="admin-ds-workflow-body">
        <div class="admin-ds-table-section-header">
          <h3>Filter Conditions</h3>
          <button class="admin-secondary-button" type="button" @click="addCondition">Add Condition</button>
        </div>

        <p v-if="error" class="admin-ds-workflow-error" role="alert">{{ error }}</p>
        <p v-if="modelValue.length === 0" class="admin-ds-workflow-state">No filter conditions configured.</p>

        <div v-else class="admin-ds-filter-list">
          <fieldset v-for="(condition, index) in modelValue" :key="condition.id" class="admin-ds-filter-row">
            <legend>Condition {{ index + 1 }}</legend>
            <label>
              <span>Column</span>
              <select
                :value="condition.column"
                :aria-label="`Column for condition ${index + 1}`"
                @change="updateCondition(index, 'column', inputValue($event))"
              >
                <option value="">Select column...</option>
                <option v-for="field in fieldOptions(condition)" :key="field" :value="field">{{ field }}</option>
              </select>
            </label>
            <label>
              <span>Operator</span>
              <select
                :value="condition.operator"
                :aria-label="`Operator for condition ${index + 1}`"
                @change="updateCondition(index, 'operator', inputValue($event))"
              >
                <option v-for="operator in ADMIN_DATA_SOURCE_FILTER_OPERATORS" :key="operator" :value="operator">{{ operator }}</option>
              </select>
            </label>
            <label>
              <span>Value</span>
              <input
                :value="condition.value"
                type="text"
                :aria-label="`Value for condition ${index + 1}`"
                @input="updateCondition(index, 'value', inputValue($event))"
              />
            </label>
            <label>
              <span>Logic</span>
              <select
                :value="condition.logicOperator"
                :aria-label="`Logic for condition ${index + 1}`"
                @change="updateCondition(index, 'logicOperator', inputValue($event))"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            </label>
            <button class="admin-danger-button" type="button" :aria-label="`Remove condition ${index + 1}`" @click="removeCondition(index)">
              Remove
            </button>
          </fieldset>
        </div>
      </div>

      <footer class="admin-modal-footer">
        <button class="admin-secondary-button" type="button" @click="emit('close')">Cancel</button>
        <button class="button" type="button" :disabled="isSaving" @click="emit('save')">
          {{ isSaving ? 'Saving...' : 'Save Filters' }}
        </button>
      </footer>
    </section>
  </div>
</template>
