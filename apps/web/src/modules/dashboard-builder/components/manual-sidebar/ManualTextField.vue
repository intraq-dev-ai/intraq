<script setup lang="ts">
const props = defineProps<{
  hideLabel?: boolean;
  inputId?: string;
  label: string;
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

function updateText(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  emit('update:modelValue', input?.value ?? '');
}
</script>

<template>
  <div class="manual-text-field">
    <label v-if="!hideLabel" class="editor-field-label" :for="inputId">{{ label }}</label>
    <input
      :id="inputId"
      class="editor-input"
      :placeholder="placeholder"
      :value="modelValue"
      @input="updateText"
    />
  </div>
</template>

<style scoped>
.manual-text-field {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}
</style>
