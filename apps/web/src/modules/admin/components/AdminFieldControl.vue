<script setup lang="ts">
import type { AdminField, AdminFieldValue } from '../types';

const props = defineProps<{
  field: AdminField;
  inputId: string;
  modelValue: AdminFieldValue | undefined;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AdminFieldValue];
}>();

function textValue(): string {
  return String(props.modelValue ?? '');
}

function checkedValue(): boolean {
  return Boolean(props.modelValue);
}

function inputType(): string {
  if (props.field.type === 'number') return 'number';
  if (props.field.type === 'password') return 'password';
  return 'text';
}

function updateText(value: string): void {
  emit('update:modelValue', props.field.type === 'number' && value !== '' ? Number(value) : value);
}

function updateChecked(value: boolean): void {
  emit('update:modelValue', value);
}

function readValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function readChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}
</script>

<template>
  <label class="admin-field" :for="inputId">
    <span>{{ field.label }}</span>
    <select
      v-if="field.type === 'select'"
      :id="inputId"
      :required="field.required"
      :value="textValue()"
      @change="updateText(readValue($event))"
    >
      <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
    <textarea
      v-else-if="field.type === 'textarea'"
      :id="inputId"
      :required="field.required"
      :value="textValue()"
      rows="3"
      @input="updateText(readValue($event))"
    />
    <input
      v-else-if="field.type === 'checkbox'"
      :id="inputId"
      type="checkbox"
      :checked="checkedValue()"
      @change="updateChecked(readChecked($event))"
    >
    <input
      v-else
      :id="inputId"
      :type="inputType()"
      :required="field.required"
      :value="textValue()"
      @input="updateText(readValue($event))"
    >
  </label>
</template>
