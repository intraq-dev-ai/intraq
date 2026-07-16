<script setup lang="ts">
import { tableFormatOptions } from '../component-info-dialog-options';
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showMatrixDesignDialog" class="modal-overlay" @click.self="ctx.showMatrixDesignDialog = false">
    <div class="modal-box">
      <div class="modal-header">
        <h4>Matrix Styling</h4>
        <button type="button" class="modal-close" @click="ctx.showMatrixDesignDialog = false">&times;</button>
      </div>
      <div class="modal-body">
        <div class="dialog-field">
          <label class="editor-field-label">Table Format</label>
          <select v-model="ctx.tableFormat" aria-label="Table Format" class="editor-select" @change="ctx.applyMatrixTableFormat(ctx.tableFormat)">
            <option v-for="format in tableFormatOptions" :key="format.value" :value="format.value">{{ format.label }}</option>
          </select>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show Matrix Title</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.matrixShowTitle" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <template v-if="ctx.matrixShowTitle">
          <div class="dialog-two-col">
            <div class="dialog-field">
              <label class="editor-field-label">Title Font Size</label>
              <select v-model="ctx.matrixTitleFontSize" class="editor-select">
                <option value="text-sm">Small</option>
                <option value="text-base">Medium</option>
                <option value="text-lg">Large</option>
                <option value="text-xl">Extra Large</option>
                <option value="text-2xl">2X Large</option>
              </select>
            </div>
            <div class="dialog-field">
              <label class="editor-field-label">Title Font Weight</label>
              <select v-model="ctx.matrixTitleFontWeight" class="editor-select">
                <option value="font-normal">Normal</option>
                <option value="font-medium">Medium</option>
                <option value="font-semibold">Semi Bold</option>
                <option value="font-bold">Bold</option>
              </select>
            </div>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Title Color</label>
            <div class="color-row">
              <input type="color" v-model="ctx.matrixTitleColor" class="color-swatch" />
              <input v-model="ctx.matrixTitleColor" class="editor-input color-hex" placeholder="#111827" />
            </div>
          </div>
        </template>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Row Display Mode</label>
            <select v-model="ctx.matrixRowDataDisplayMode" class="editor-select">
              <option value="repeat">Repeat row labels</option>
              <option value="merge">Merge row labels</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Column Display Mode</label>
            <select v-model="ctx.matrixColumnDataDisplayMode" class="editor-select">
              <option value="repeat">Repeat column labels</option>
              <option value="merge">Merge column labels</option>
            </select>
          </div>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show Value Field Headers</span>
          <label class="toggle-switch">
            <input
              aria-label="Show Value Field Headers"
              type="checkbox"
              v-model="ctx.matrixShowValueHeaders"
              :disabled="ctx.matrixConfiguredValues.length > 1"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <p v-if="ctx.matrixConfiguredValues.length > 1" class="form-help">Multiple value fields always show sub-column headers.</p>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <ManualTextField
              v-model="ctx.matrixRowHeaderLabel"
              input-id="matrix-row-header-label-input"
              label="Row Header Label"
              placeholder="Location"
            />
          </div>
          <div class="dialog-field">
            <ManualTextField
              v-model="ctx.matrixColumnHeaderLabel"
              input-id="matrix-column-header-label-input"
              label="Column Header Label"
              placeholder="Period"
            />
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <ManualTextField
              v-model="ctx.matrixValueHeaderLabel"
              input-id="matrix-value-header-label-input"
              label="Value Header Label"
              placeholder="Metric"
            />
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Value Header Width</label>
            <input v-model="ctx.matrixValueHeaderWidth" aria-label="Value Header Width" class="editor-input" placeholder="120px" />
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Row Header Width</label>
            <select v-model="ctx.matrixRowHeaderWidthType" aria-label="Row Header Width" class="editor-select">
              <option value="auto">Auto</option>
              <option value="fixed">Fixed</option>
              <option value="full">Full</option>
            </select>
            <input
              v-if="ctx.matrixRowHeaderWidthType === 'fixed'"
              v-model="ctx.matrixRowHeaderWidth"
              aria-label="Row Header Width Value"
              class="editor-input dialog-field__spaced-input"
              inputmode="numeric"
              placeholder="200"
            />
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Column Header Width</label>
            <select v-model="ctx.matrixColumnHeaderWidthType" aria-label="Column Header Width" class="editor-select">
              <option value="auto">Auto</option>
              <option value="fixed">Fixed</option>
              <option value="full">Full</option>
            </select>
            <input
              v-if="ctx.matrixColumnHeaderWidthType === 'fixed'"
              v-model="ctx.matrixColumnHeaderWidth"
              aria-label="Column Header Width Value"
              class="editor-input dialog-field__spaced-input"
              inputmode="numeric"
              placeholder="120"
            />
          </div>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Header Background</label>
          <div class="color-row">
            <input type="color" v-model="ctx.matrixHeaderBg" class="color-swatch" />
            <input v-model="ctx.matrixHeaderBg" class="editor-input color-hex" placeholder="#f8fafc" />
          </div>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Header Text Color</label>
          <div class="color-row">
            <input type="color" v-model="ctx.matrixHeaderText" class="color-swatch" />
            <input v-model="ctx.matrixHeaderText" class="editor-input color-hex" placeholder="#111827" />
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Header Alignment</label>
            <select v-model="ctx.matrixHeaderAlign" class="editor-select">
              <option value="text-left">Left</option>
              <option value="text-center">Center</option>
              <option value="text-right">Right</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Header Weight</label>
            <select v-model="ctx.matrixHeaderFontWeight" class="editor-select">
              <option value="font-normal">Normal</option>
              <option value="font-medium">Medium</option>
              <option value="font-semibold">Semi Bold</option>
              <option value="font-bold">Bold</option>
            </select>
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Row Header Alignment</label>
            <select v-model="ctx.matrixRowHeaderAlign" class="editor-select">
              <option value="text-left">Left</option>
              <option value="text-center">Center</option>
              <option value="text-right">Right</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Row Header Weight</label>
            <select v-model="ctx.matrixRowHeaderFontWeight" class="editor-select">
              <option value="font-normal">Normal</option>
              <option value="font-medium">Medium</option>
              <option value="font-semibold">Semi Bold</option>
              <option value="font-bold">Bold</option>
            </select>
          </div>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Row Background</label>
          <div class="color-row">
            <input type="color" v-model="ctx.matrixRowBg" class="color-swatch" />
            <input v-model="ctx.matrixRowBg" class="editor-input color-hex" placeholder="#ffffff" />
          </div>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Row Text Color</label>
          <div class="color-row">
            <input type="color" v-model="ctx.matrixRowText" class="color-swatch" />
            <input v-model="ctx.matrixRowText" class="editor-input color-hex" placeholder="#111827" />
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Row Alignment</label>
            <select v-model="ctx.matrixRowAlign" class="editor-select">
              <option value="text-left">Left</option>
              <option value="text-center">Center</option>
              <option value="text-right">Right</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Row Weight</label>
            <select v-model="ctx.matrixRowFontWeight" class="editor-select">
              <option value="font-normal">Normal</option>
              <option value="font-medium">Medium</option>
              <option value="font-semibold">Semi Bold</option>
              <option value="font-bold">Bold</option>
            </select>
          </div>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Border Color</label>
          <div class="color-row">
            <input type="color" v-model="ctx.matrixBorderColor" class="color-swatch" />
            <input v-model="ctx.matrixBorderColor" class="editor-input color-hex" placeholder="#d1d5db" />
          </div>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Show Borders</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="ctx.matrixShowBorders" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Font Size</label>
          <select v-model="ctx.matrixFontSize" class="editor-select">
            <option value="">Default</option>
            <option value="text-xs">Extra Small</option>
            <option value="text-sm">Small</option>
            <option value="text-base">Medium</option>
            <option value="text-lg">Large</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>

<style scoped>
.dialog-field__spaced-input {
  margin-top: 8px;
}
</style>
