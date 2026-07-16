<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div class="dialog-field">
    <label class="editor-field-label">Supporting Metric Field</label>
    <select v-model="ctx.cardSupportingField" class="editor-select">
      <option value="">None</option>
      <option v-for="field in ctx.currentTableFields" :key="`supporting-${field.name}`" :value="field.name">
        {{ ctx.fieldLabel(field) }}
      </option>
    </select>
  </div>
  <div v-if="ctx.cardSupportingField" class="dialog-two-col dialog-indent">
    <div class="dialog-field">
      <label class="editor-field-label">Supporting Aggregation</label>
      <select v-model="ctx.cardSupportingAggregation" class="editor-select">
        <option value="sum">Sum</option>
        <option value="avg">Average</option>
        <option value="count">Count</option>
        <option value="min">Min</option>
        <option value="max">Max</option>
        <option value="first">First</option>
        <option value="last">Last</option>
      </select>
    </div>
    <div class="dialog-field">
      <label class="editor-field-label">Supporting Format</label>
      <select v-model="ctx.cardSupportingFormat" class="editor-select">
        <option value="number">Number</option>
        <option value="percentage">Percentage</option>
        <option value="currency">Currency</option>
      </select>
    </div>
  </div>
  <div class="dialog-two-col dialog-indent">
    <div class="dialog-field">
      <label class="editor-field-label">Supporting Label</label>
      <input v-model="ctx.cardSupportingLabel" class="editor-input" placeholder="of portfolio balance" />
    </div>
    <div v-if="ctx.cardSupportingField" class="dialog-field">
      <label class="editor-field-label">Supporting Decimals</label>
      <input v-model.number="ctx.cardSupportingPrecision" type="number" min="0" max="6" class="editor-input" placeholder="Auto" />
    </div>
  </div>
  <div v-if="ctx.cardSupportingField" class="dialog-field dialog-indent">
    <label class="editor-field-label">Supporting Tone</label>
    <select v-model="ctx.cardSupportingTone" class="editor-select">
      <option value="default">Default</option>
      <option value="info">Information</option>
      <option value="success">Healthy</option>
      <option value="warning">Watch</option>
      <option value="danger">Action required</option>
    </select>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
