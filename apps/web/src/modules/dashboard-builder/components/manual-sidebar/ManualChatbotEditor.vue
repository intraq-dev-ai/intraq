<script setup lang="ts">
import { computed } from 'vue';
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();

const botTitle = computed({
  get: () => readConfig('botTitle', ctx.selectedElement?.name ?? 'AI Chat Bot'),
  set: value => ctx.saveSelectedElementConfig({ botTitle: value })
});
const welcomeMessage = computed({
  get: () => readConfig('welcomeMessage', 'Ask a question about this dashboard.'),
  set: value => ctx.saveSelectedElementConfig({ welcomeMessage: value })
});
const placeholder = computed({
  get: () => readConfig('placeholder', 'Type a question...'),
  set: value => ctx.saveSelectedElementConfig({ placeholder: value })
});
const responseStyle = computed({
  get: () => readConfig('responseStyle', 'professional'),
  set: value => ctx.saveSelectedElementConfig({ responseStyle: value })
});
const enableQuickSuggestions = computed({
  get: () => ctx.selectedElement?.config?.enableQuickSuggestions !== false,
  set: value => ctx.saveSelectedElementConfig({ enableQuickSuggestions: value })
});
const enableChartRecommendations = computed({
  get: () => ctx.selectedElement?.config?.enableChartRecommendations !== false,
  set: value => ctx.saveSelectedElementConfig({ enableChartRecommendations: value })
});
const suggestionsText = computed({
  get: () => JSON.stringify(ctx.selectedElement?.config?.suggestions ?? [], null, 2),
  set: value => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) ctx.saveSelectedElementConfig({ suggestions: parsed });
    } catch {
      // Keep typing permissive; invalid JSON is ignored until it becomes valid.
    }
  }
});

function readConfig(key: string, fallback: string): string {
  const value = ctx.selectedElement?.config?.[key];
  return typeof value === 'string' ? value : fallback;
}
</script>

<template>
  <template v-if="ctx.elementType === 'chatbot'">
    <div class="editor-section">
      <div class="section-header">AI Chat Bot</div>
      <ManualTextField
        input-id="chatbot-title"
        v-model="botTitle"
        label="Bot Title"
      />
      <div class="editor-field-group">
        <label class="editor-field-label" for="chatbot-welcome">Welcome Message</label>
        <textarea id="chatbot-welcome" v-model="welcomeMessage" class="editor-input" rows="3"></textarea>
      </div>
      <div class="editor-field-group">
        <ManualTextField
          input-id="chatbot-placeholder"
          v-model="placeholder"
          label="Input Placeholder"
        />
      </div>
      <div class="editor-field-group">
        <label class="editor-field-label" for="chatbot-response-style">Response Style</label>
        <select id="chatbot-response-style" v-model="responseStyle" class="editor-select">
          <option value="professional">Professional</option>
          <option value="conversational">Conversational</option>
          <option value="analytical">Analytical</option>
          <option value="concise">Concise</option>
        </select>
      </div>
      <div class="toggle-row">
        <span class="toggle-label">Quick Suggestions</span>
        <label class="toggle-switch">
          <input v-model="enableQuickSuggestions" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <span class="toggle-label">Chart Recommendations</span>
        <label class="toggle-switch">
          <input v-model="enableChartRecommendations" type="checkbox" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="editor-section">
      <div class="section-header">Suggestions JSON</div>
      <textarea
        id="chatbot-suggestions-json"
        v-model="suggestionsText"
        class="editor-input editor-textarea"
        rows="7"
        placeholder='["Summarize this dashboard","Which metric changed most?"]'
      ></textarea>
    </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
