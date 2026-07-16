<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
      <div v-if="ctx.dataSources.length > 0" class="manual-sidebar-datasource">
        <div class="manual-ds-row">
          <label class="manual-ds-label" for="manual-data-source">Data Source</label>
          <select
            id="manual-data-source"
            class="manual-ds-select"
            :value="ctx.activeDataSourceId"
            @change="ctx.changeDataSource(ctx.inputValue($event))"
          >
            <option value="" disabled>Select data source…</option>
            <option v-for="source in ctx.dataSources" :key="source.id" :value="source.id">{{ source.name }}</option>
          </select>
        </div>
        <div class="manual-ds-row">
          <label class="manual-ds-label" for="manual-data-table">Data Model</label>
          <select
            id="manual-data-table"
            class="manual-ds-select"
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
      </div>

      <div class="manual-sidebar-palette">
        <div class="manual-sidebar-palette-header">
          <h2>Add Component</h2>
        </div>
        <div class="manual-palette-grid" aria-label="Component palette">
          <button
            v-for="item in ctx.manualComponents"
            :key="`${item.type}-${item.chartType ?? ''}`"
            class="manual-palette-btn"
            :class="`palette-${item.chartType ?? item.type}`"
            type="button"
            draggable="true"
            :aria-label="`Add ${item.label}`"
            @click="ctx.createManualElement(item.type, item.chartType)"
            @dragstart="ctx.onPaletteDragStart($event, item.type, item.chartType)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon" />
            </svg>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
