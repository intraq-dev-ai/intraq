<script setup lang="ts">
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showMatrixRowsDialog" class="modal-overlay" @click.self="ctx.applyMatrixRowsDialog">
    <div class="modal-box modal-box--wide">
      <div class="modal-header">
        <h4>Manage Row Fields</h4>
        <button type="button" class="modal-close" @click="ctx.applyMatrixRowsDialog">&times;</button>
      </div>
      <div class="modal-body">
        <div v-for="(r, i) in ctx.localMatrixRows" :key="i" class="field-row">
          <select v-model="r.field" class="editor-select field-row-field">
            <option value="">Select field…</option>
            <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
          </select>
          <ManualTextField
            v-model="r.label"
            class="field-row-label"
            hide-label
            label="Row field label"
            placeholder="Custom label"
          />
          <button type="button" class="remove-btn" @click="ctx.localMatrixRows.splice(i, 1)">&times;</button>
        </div>
        <button type="button" class="add-btn" @click="ctx.localMatrixRows.push({ field: '', label: '' })">+ Add Row Field</button>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.applyMatrixRowsDialog">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
