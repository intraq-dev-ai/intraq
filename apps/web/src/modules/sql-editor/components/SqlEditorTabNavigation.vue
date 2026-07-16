<script setup lang="ts">
import type { SqlEditorTab } from '../types';

defineProps<{
  activeTabId: string;
  tabs: SqlEditorTab[];
}>();

const emit = defineEmits<{
  addTab: [];
  closeTab: [tabId: string];
  switchTab: [tabId: string];
}>();
</script>

<template>
  <nav class="tab-navigation sql-editor-tabs" aria-label="SQL query tabs">
    <div class="tab-list">
      <div v-for="tab in tabs" :key="tab.id" class="tab-item sql-editor-tab-item" :class="{ active: tab.id === activeTabId }">
        <button
          type="button"
          class="tab-content"
          :aria-current="tab.id === activeTabId"
          @click="emit('switchTab', tab.id)"
        >
          <span class="tab-header">
            <span v-if="tab.id === activeTabId" class="active-indicator sql-editor-active-dot" aria-hidden="true"></span>
            <span class="tab-title">{{ tab.name }}</span>
          </span>
          <small class="tab-datasource">{{ tab.dataSourceName || 'No Data Source' }}</small>
        </button>
        <button
          v-if="tabs.length > 1"
          type="button"
          class="tab-close sql-editor-tab-close"
          :aria-label="`Close ${tab.name}`"
          @click="emit('closeTab', tab.id)"
        >
          x
        </button>
      </div>
      <button
        type="button"
        class="add-tab-btn sql-editor-add-tab"
        aria-label="New tab"
        @click="emit('addTab')"
      >
        +
      </button>
    </div>
  </nav>
</template>
