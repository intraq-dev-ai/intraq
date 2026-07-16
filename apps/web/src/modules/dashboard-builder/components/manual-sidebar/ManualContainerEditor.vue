<script setup lang="ts">
import { computed } from 'vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();

const containerBackgroundColorInput = computed({
  get: () => colorInputValue(ctx.containerBackgroundColor, '#f8fafc'),
  set: (value: string) => { ctx.containerBackgroundColor = value; }
});

const containerBorderColorInput = computed({
  get: () => colorInputValue(ctx.containerBorderColor, '#e2e8f0'),
  set: (value: string) => { ctx.containerBorderColor = value; }
});

function setTransparentBackground(): void {
  ctx.containerBackgroundColor = 'transparent';
  ctx.submitElement();
}

function colorInputValue(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}
</script>

<template>
  <template v-if="ctx.elementType === 'container' || ctx.elementType === 'filter-container'">
    <div class="editor-section">
      <label class="inline-checkbox">
        <input v-model="ctx.containerShowTitle" type="checkbox" @change="ctx.submitElement" />
        <span>Show title</span>
      </label>
    </div>

    <div class="editor-section">
      <label class="editor-field-label">Background</label>
      <div class="color-row">
        <input v-model="containerBackgroundColorInput" type="color" class="color-swatch" @input="ctx.submitElement" />
        <input v-model="ctx.containerBackgroundColor" class="editor-input color-hex" placeholder="#f8fafc or transparent" @input="ctx.submitElement" />
        <button type="button" class="color-reset-btn" @click="setTransparentBackground">None</button>
      </div>
    </div>

    <div class="editor-section">
      <label class="editor-field-label">Border</label>
      <div class="color-row">
        <input v-model="containerBorderColorInput" type="color" class="color-swatch" @input="ctx.submitElement" />
        <input v-model="ctx.containerBorderColor" class="editor-input color-hex" placeholder="#e2e8f0" @input="ctx.submitElement" />
      </div>
    </div>

    <div class="editor-section editor-grid-2">
      <label>
        <span class="editor-field-label">Border width</span>
        <input v-model="ctx.containerBorderWidth" class="editor-input" placeholder="1 or 0" @input="ctx.submitElement" />
      </label>
      <label>
        <span class="editor-field-label">Radius</span>
        <input v-model="ctx.containerBorderRadius" class="editor-input" placeholder="8" @input="ctx.submitElement" />
      </label>
    </div>

    <div class="editor-section editor-grid-2">
      <label>
        <span class="editor-field-label">Padding</span>
        <input v-model="ctx.containerPadding" class="editor-input" placeholder="14" @input="ctx.submitElement" />
      </label>
      <label>
        <span class="editor-field-label">Gap</span>
        <input v-model="ctx.containerGap" class="editor-input" placeholder="12" @input="ctx.submitElement" />
      </label>
    </div>

    <div class="editor-section">
      <label class="editor-field-label" for="container-columns">Columns</label>
      <input id="container-columns" v-model.number="ctx.containerColumns" type="number" min="1" max="8" class="editor-input" @input="ctx.submitElement" />
    </div>
  </template>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
