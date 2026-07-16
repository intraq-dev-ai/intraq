<script setup lang="ts">
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showMatrixColsDialog" class="modal-overlay" @click.self="ctx.applyMatrixColsDialog">
    <div class="modal-box modal-box--wide">
      <div class="modal-header">
        <h4>Manage Column Fields</h4>
        <button type="button" class="modal-close" @click="ctx.applyMatrixColsDialog">&times;</button>
      </div>
      <div class="modal-body">
        <div v-for="(c, i) in ctx.localMatrixCols" :key="i" class="field-row">
          <select v-model="c.field" class="editor-select field-row-field">
            <option value="">Select field…</option>
            <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
          </select>
          <ManualTextField
            v-model="c.label"
            class="field-row-label"
            hide-label
            label="Column field label"
            placeholder="Custom label"
          />
          <button type="button" class="remove-btn" @click="ctx.localMatrixCols.splice(i, 1)">&times;</button>
        </div>
        <button type="button" class="add-btn" @click="ctx.localMatrixCols.push({ field: '', label: '' })">+ Add Column Field</button>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.applyMatrixColsDialog">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
