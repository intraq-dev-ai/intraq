<script setup lang="ts">
defineProps<{
  configuredFields: string[];
}>();

const xField = defineModel<string>('xField', { required: true });
const measureFields = defineModel<string>('measureFields', { required: true });
const valueField = defineModel<string>('valueField', { required: true });
const resultLimit = defineModel<number>('resultLimit', { required: true });
const resultLimitExplicit = defineModel<boolean>('resultLimitExplicit', { required: true });
const showLegend = defineModel<boolean>('showLegend', { required: true });
const showTooltip = defineModel<boolean>('showTooltip', { required: true });
</script>

<template>
  <fieldset class="visualization-control-group" aria-label="Visualization controls">
    <legend>Visualization controls</legend>
    <label for="element-dimension-field">Dimension field</label>
    <select id="element-dimension-field" v-model="xField">
      <option value="">Auto select</option>
      <option v-for="field in configuredFields" :key="`dimension-${field}`" :value="field">{{ field }}</option>
    </select>
    <label for="element-measure-fields">Measure fields</label>
    <input id="element-measure-fields" v-model="measureFields" placeholder="measure_field, second_measure">
    <label for="element-value-field">Value field</label>
    <select id="element-value-field" v-model="valueField">
      <option value="">Use first measure</option>
      <option v-for="field in configuredFields" :key="`value-${field}`" :value="field">{{ field }}</option>
    </select>
    <label for="element-result-limit">Result limit</label>
    <input id="element-result-limit" v-model.number="resultLimit" type="number" min="1" max="100" @input="resultLimitExplicit = true">
    <label class="inline-checkbox"><input v-model="showLegend" type="checkbox"> Show legend</label>
    <label class="inline-checkbox"><input v-model="showTooltip" type="checkbox"> Show tooltips</label>
  </fieldset>
</template>
