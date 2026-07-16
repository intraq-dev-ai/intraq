<script setup lang="ts">
import ManualCardEditor from './ManualCardEditor.vue';
import ManualChatbotEditor from './ManualChatbotEditor.vue';
import ManualChartEditor from './ManualChartEditor.vue';
import ManualContainerEditor from './ManualContainerEditor.vue';
import ManualFilterEditor from './ManualFilterEditor.vue';
import ManualTextField from './ManualTextField.vue';
import ManualMatrixEditor from './ManualMatrixEditor.vue';
import ManualNewsEditor from './ManualNewsEditor.vue';
import ManualTableEditor from './ManualTableEditor.vue';
import ManualTextEditor from './ManualTextEditor.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <form
    class="manual-sidebar-editor"
    aria-label="Dashboard element editor"
    @submit.prevent
  >
    <div class="editor-heading">
      <h3>{{ ctx.selectedElement?.name }}</h3>
      <div class="editor-heading-actions">
        <button
          type="button"
          class="editor-clear-button"
          aria-label="Stop editing"
          @click="ctx.clearSelectedElement()"
        >
          Stop editing
        </button>
      </div>
    </div>

    <div class="editor-section">
      <ManualTextField
        input-id="el-name"
        v-model="ctx.elementName"
        label="Title"
        placeholder="Element title"
        @update:model-value="ctx.submitElement"
      />
    </div>

    <div v-if="ctx.elementUsesDataSource" class="editor-section">
      <label class="editor-field-label" for="el-ds">Data Source</label>
      <select
        id="el-ds"
        class="editor-select"
        :value="ctx.activeDataSourceId"
        @change="ctx.changeDataSource(ctx.inputValue($event))"
      >
        <option value="" disabled>Select data source…</option>
        <option v-for="ds in ctx.dataSources" :key="ds.id" :value="ds.id">{{ ds.name }}</option>
      </select>
    </div>
    <div v-if="ctx.elementUsesDataSource" class="editor-section">
      <label class="editor-field-label" for="el-table">Data Model</label>
      <select
        id="el-table"
        class="editor-select"
        :value="ctx.activeTableId"
        :disabled="!ctx.activeDataSourceId"
        @change="ctx.changeDataTable(ctx.inputValue($event))"
      >
        <option value="" disabled>Select data model…</option>
        <option
          v-for="table in ctx.activeTables"
          :key="table.id"
          :value="table.id"
        >
          #{{ ctx.tableLabel(table) }}
        </option>
      </select>
    </div>

    <ManualChartEditor />
    <ManualTableEditor />
    <ManualCardEditor />
    <ManualContainerEditor />
    <ManualMatrixEditor />
    <ManualFilterEditor />
    <ManualNewsEditor />
    <ManualChatbotEditor />
    <ManualTextEditor />

    <p v-if="ctx.configError" class="editor-config-error" role="alert">{{ ctx.configError }}</p>
    <p class="editor-autosave-hint" aria-live="polite">
      <span v-if="ctx.isSaving">Saving…</span>
      <span v-else>Changes stay local until Save</span>
    </p>
  </form>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
