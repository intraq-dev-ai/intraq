<script setup lang="ts">
import { computed } from 'vue';
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();

const newsTitle = computed({
  get: () => readConfig('newsTitle', ctx.selectedElement?.name ?? 'News View'),
  set: value => ctx.saveSelectedElementConfig({ newsTitle: value })
});
const sourceLabel = computed({
  get: () => readConfig('sourceLabel', 'Dashboard updates'),
  set: value => ctx.saveSelectedElementConfig({ sourceLabel: value })
});
const headlineField = computed({
  get: () => readFieldConfig('headlineField', 0),
  set: value => ctx.saveSelectedElementConfig({ headlineField: value })
});
const summaryField = computed({
  get: () => readFieldConfig('summaryField', 1),
  set: value => ctx.saveSelectedElementConfig({ summaryField: value })
});
const sourceField = computed({
  get: () => readFieldConfig('sourceField', 2),
  set: value => ctx.saveSelectedElementConfig({ sourceField: value })
});
const dateField = computed({
  get: () => readFieldConfig('dateField', 0),
  set: value => ctx.saveSelectedElementConfig({ dateField: value })
});
const relevanceField = computed({
  get: () => readConfig('relevanceField', ''),
  set: value => ctx.saveSelectedElementConfig({ relevanceField: value })
});
const enablePagination = computed({
  get: () => ctx.selectedElement?.config?.enablePagination !== false,
  set: value => ctx.saveSelectedElementConfig({ enablePagination: value })
});
const itemsPerPage = computed({
  get: () => readNumberConfig('itemsPerPage', readNumberConfig('maxItems', 5)),
  set: value => ctx.saveSelectedElementConfig({ itemsPerPage: value, maxItems: value })
});
const itemsText = computed({
  get: () => JSON.stringify(ctx.selectedElement?.config?.items ?? [], null, 2),
  set: value => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) ctx.saveSelectedElementConfig({ items: parsed });
    } catch {
      // Keep typing permissive; invalid JSON is ignored until it becomes valid.
    }
  }
});

function readConfig(key: string, fallback: string): string {
  const value = ctx.selectedElement?.config?.[key];
  return typeof value === 'string' ? value : fallback;
}

function readFieldConfig(key: string, fallbackIndex: number): string {
  const configured = readConfig(key, '');
  if (configured) return configured;
  return ctx.currentTableFields[fallbackIndex]?.name ?? '';
}

function readNumberConfig(key: string, fallback: number): number {
  const value = ctx.selectedElement?.config?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
</script>

<template>
  <template v-if="ctx.elementType === 'news'">
    <div class="editor-section">
      <div class="section-header">News View</div>
      <ManualTextField
        input-id="news-title"
        v-model="newsTitle"
        label="Display Title"
      />
      <div class="editor-field-group">
        <ManualTextField
          input-id="news-source"
          v-model="sourceLabel"
          label="Source Label"
        />
      </div>
      <div class="editor-field-group">
        <label class="editor-field-label" for="news-headline-field">Headline Field</label>
        <select id="news-headline-field" v-model="headlineField" class="editor-select">
          <option value="">Select headline field…</option>
          <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
        </select>
      </div>
      <div class="editor-field-group">
        <label class="editor-field-label" for="news-summary-field">Summary Field</label>
        <select id="news-summary-field" v-model="summaryField" class="editor-select">
          <option value="">Select summary field…</option>
          <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
        </select>
      </div>
      <div class="editor-field-group">
        <label class="editor-field-label" for="news-source-field">Source Field</label>
        <select id="news-source-field" v-model="sourceField" class="editor-select">
          <option value="">Select source field…</option>
          <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
        </select>
      </div>
      <div class="editor-field-group">
        <label class="editor-field-label" for="news-date-field">Date Field</label>
        <select id="news-date-field" v-model="dateField" class="editor-select">
          <option value="">Select date field…</option>
          <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
        </select>
      </div>
      <div class="editor-field-group">
        <label class="editor-field-label" for="news-relevance-field">Relevance Field</label>
        <select id="news-relevance-field" v-model="relevanceField" class="editor-select">
          <option value="">No relevance score</option>
          <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
        </select>
      </div>
      <div class="toggle-row">
        <span class="toggle-label">Enable Pagination</span>
        <label class="toggle-switch">
          <input v-model="enablePagination" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="editor-field-group">
        <label class="editor-field-label" for="news-items-per-page">Items Per Page</label>
        <input id="news-items-per-page" v-model.number="itemsPerPage" type="number" min="1" max="50" class="editor-input" />
      </div>
    </div>
    <div class="editor-section">
      <div class="section-header">Items JSON</div>
      <textarea
        id="news-items-json"
        v-model="itemsText"
        class="editor-input editor-textarea"
        rows="8"
        placeholder='[{"title":"Headline","summary":"Short update","meta":"Source"}]'
      ></textarea>
    </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
