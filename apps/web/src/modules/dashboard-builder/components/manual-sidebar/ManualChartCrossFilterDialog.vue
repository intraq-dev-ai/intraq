<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showCrossFilterDialog" class="modal-overlay" @click.self="ctx.closeCrossFilterDialog">
    <div class="modal-box">
      <div class="modal-header">
        <h4>Cross-Filter Targets</h4>
        <button type="button" class="modal-close" @click="ctx.closeCrossFilterDialog">&times;</button>
      </div>
      <div class="modal-body">
        <div class="dialog-field">
          <label class="editor-field-label">Mode</label>
          <select v-model="ctx.crossFilterModeDraft" class="editor-select">
            <option value="auto">Auto target compatible components</option>
            <option value="selected">Only selected components</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div v-if="ctx.crossFilterModeDraft === 'selected'" class="dialog-field">
          <label class="editor-field-label">Target Components</label>
          <div v-if="ctx.crossFilterTargetOptions.length > 0" class="dashboard-table-column-filter-values" role="group" aria-label="Cross-filter target components">
            <label
              v-for="target in ctx.crossFilterTargetOptions"
              :key="target.id"
              class="dashboard-table-column-filter-checkbox"
            >
              <input v-model="ctx.selectedCrossFilterTargetElementIds" type="checkbox" :value="target.id" :aria-label="`Use ${target.name}`">
              <span>{{ target.name }}</span>
              <small>{{ target.type }}</small>
            </label>
          </div>
          <p v-else class="dashboard-table-filter-status">No compatible target components found for this chart.</p>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.closeCrossFilterDialog">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
