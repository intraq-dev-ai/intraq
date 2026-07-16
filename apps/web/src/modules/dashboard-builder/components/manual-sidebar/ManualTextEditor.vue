<script setup lang="ts">
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <template v-if="ctx.elementType === 'text'">
    <div class="editor-section">
      <label class="inline-checkbox">
        <input v-model="ctx.textAiGenerated" type="checkbox" @change="ctx.saveTextElement" />
        <span>Generate content with AI</span>
      </label>
    </div>

    <div v-if="ctx.textAiGenerated" class="editor-section">
      <label class="editor-field-label" for="text-generation-prompt">AI instruction</label>
      <textarea
        id="text-generation-prompt"
        v-model="ctx.textGenerationPrompt"
        class="editor-input manual-text-prompt-input"
        maxlength="2000"
        rows="4"
        placeholder="Summarize the most material risk and the next action."
        @input="ctx.saveTextElement"
      ></textarea>
    </div>

    <div v-if="ctx.textAiGenerated" class="editor-section">
      <label>
        <span class="editor-field-label">Cache duration</span>
        <select v-model.number="ctx.textAiCacheTtlMinutes" class="editor-select" @change="ctx.saveTextElement">
          <option :value="15">15 minutes</option>
          <option :value="60">1 hour</option>
          <option :value="1440">1 day</option>
        </select>
      </label>
    </div>

    <div class="editor-section">
      <label class="editor-field-label" for="text-content">{{ ctx.textAiGenerated ? 'Fallback content' : 'Content' }}</label>
      <textarea
        id="text-content"
        v-model="ctx.textContent"
        class="editor-input manual-text-content-input"
        rows="5"
        placeholder="State the finding, impact, or decision clearly."
        @input="ctx.saveTextElement"
      ></textarea>
    </div>

    <div class="editor-section editor-grid-2">
      <label>
        <span class="editor-field-label">Style</span>
        <select v-model="ctx.textVariant" class="editor-select" @change="ctx.saveTextElement">
          <option value="body">Body text</option>
          <option value="section">Section heading</option>
          <option value="insight">Insight callout</option>
        </select>
      </label>
      <label>
        <span class="editor-field-label">Tone</span>
        <select v-model="ctx.textTone" class="editor-select" @change="ctx.saveTextElement">
          <option value="neutral">Neutral</option>
          <option value="info">Information</option>
          <option value="success">Healthy</option>
          <option value="warning">Watch</option>
          <option value="critical">Action required</option>
        </select>
      </label>
    </div>

    <div class="editor-section">
      <label class="editor-field-label" for="text-badge">Status label</label>
      <input
        id="text-badge"
        v-model="ctx.textBadge"
        class="editor-input"
        maxlength="40"
        placeholder="Optional, e.g. Action required"
        @input="ctx.saveTextElement"
      />
    </div>

    <div class="editor-section">
      <label class="inline-checkbox">
        <input v-model="ctx.textShowIcon" type="checkbox" @change="ctx.saveTextElement" />
        <span>Show status icon</span>
      </label>
    </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>

<style scoped>
.manual-text-content-input {
  min-height: 112px;
  resize: vertical;
}

.manual-text-prompt-input {
  min-height: 96px;
  resize: vertical;
}
</style>
