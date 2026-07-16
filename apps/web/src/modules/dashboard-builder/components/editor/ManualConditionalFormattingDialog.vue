<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { BuilderDataField } from '../../types';
import './manual-legacy-dialogs.css';

type Rule = Record<string, any>;

const props = withDefaults(defineProps<{
  availableFields: BuilderDataField[];
  matrixColumnFieldsText?: string;
  matrixRowFieldsText?: string;
  matrixValueFieldsText?: string;
  mode?: 'table' | 'matrix';
  open: boolean;
  rulesText: string;
}>(), {
  matrixColumnFieldsText: '',
  matrixRowFieldsText: '',
  matrixValueFieldsText: '',
  mode: 'table'
});

const emit = defineEmits<{
  apply: [];
  'update:open': [value: boolean];
  'update:rulesText': [value: string];
}>();

const dialogEl = ref<HTMLElement | null>(null);
const rules = ref<Rule[]>([]);
const parseError = ref('');

onMounted(() => { dialogEl.value?.focus(); });

const fieldOptions = computed(() => props.availableFields.map(field => ({
  label: field.label ?? field.description ?? field.name,
  value: field.name
})));

const rowOptions = computed(() => fieldEntries(props.matrixRowFieldsText));
const columnOptions = computed(() => fieldEntries(props.matrixColumnFieldsText));
const valueOptions = computed(() => fieldEntries(props.matrixValueFieldsText));

const colorPalettes: Record<string, { colors: string[]; name: string }> = {
  redYellowGreen: {
    name: 'Red-Yellow-Green',
    colors: ['#d32f2f', '#fbc02d', '#388e3c']
  },
  blueWhiteRed: {
    name: 'Blue-White-Red',
    colors: ['#1976d2', '#ffffff', '#d32f2f']
  },
  greenWhiteRed: {
    name: 'Green-White-Red',
    colors: ['#388e3c', '#ffffff', '#d32f2f']
  },
  blueScale: {
    name: 'Blue Scale',
    colors: ['#e3f2fd', '#42a5f5', '#0d47a1']
  },
  redScale: {
    name: 'Red Scale',
    colors: ['#ffebee', '#ef5350', '#b71c1c']
  },
  greenScale: {
    name: 'Green Scale',
    colors: ['#e8f5e9', '#66bb6a', '#1b5e20']
  },
  purpleScale: {
    name: 'Purple Scale',
    colors: ['#f3e5f5', '#ab47bc', '#4a148c']
  },
  orangeScale: {
    name: 'Orange Scale',
    colors: ['#fff3e0', '#ff9800', '#e65100']
  },
  rainbow: {
    name: 'Rainbow',
    colors: ['#9c27b0', '#2196f3', '#4caf50', '#ffeb3b', '#ff5722']
  },
  heatmap: {
    name: 'Heatmap',
    colors: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']
  }
};

watch(() => [props.open, props.rulesText] as const, () => {
  if (!props.open) return;
  parseRules();
}, { immediate: true });

watch(rules, () => {
  emit('update:rulesText', serializeRules());
}, { deep: true });

function parseRules(): void {
  parseError.value = '';
  const trimmed = props.rulesText.trim();
  if (!trimmed) {
    rules.value = [];
    return;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    rules.value = Array.isArray(parsed)
      ? parsed.filter((item): item is Rule => item !== null && typeof item === 'object' && !Array.isArray(item))
      : [];
  } catch {
    parseError.value = 'Conditional formatting JSON could not be parsed. Fix the JSON before editing visually.';
    rules.value = [];
  }
}

function closeDialog(): void {
  emit('update:rulesText', serializeRules());
  emit('update:open', false);
  queueMicrotask(() => emit('apply'));
}

function serializeRules(): string {
  const normalized = rules.value.map(rule => normalizedRule(rule));
  return normalized.length ? JSON.stringify(normalized, null, 2) : '';
}

function addRule(): void {
  const field = fieldOptions.value[0]?.value ?? '';
  rules.value.push(props.mode === 'matrix'
    ? {
        formatType: 'rules',
        applyTo: 'column',
        column: '',
        row: '',
        field: '',
        operator: '==',
        value: '',
        scope: 'cell',
        bgColor: '#ffeb3b',
        textColor: '#000000',
        bold: false,
        italic: false,
        colorScale: ['#e3f2fd', '#42a5f5', '#0d47a1'],
        textColorScale: ['#000000', '#000000'],
        selectedPalette: 'blueScale',
        autoTextColor: true,
        valueFields: []
      }
    : {
        column: field,
        field,
        operator: '==',
        value: '',
        scope: 'cell',
        scopeCell: field,
        bgColor: '#ffeb3b',
        textColor: '#000000',
        disableBg: false,
        disableText: false
      });
}

function normalizedRule(rule: Rule): Rule {
  const next = { ...rule };
  if (props.mode === 'table' && typeof next.column === 'string') next.field = next.column;
  if (props.mode === 'matrix') {
    if (next.applyTo === 'row' && typeof next.row === 'string') next.field = next.row;
    else if (typeof next.column === 'string') next.field = next.column;
  }
  return next;
}

function removeRule(index: number): void {
  rules.value.splice(index, 1);
}

function toggleDisplayOverride(rule: Rule, enabled: boolean): void {
  if (enabled) rule.displayValue ??= '';
  else delete rule.displayValue;
}

function toggleValueField(rule: Rule, field: string, checked: boolean): void {
  const existing = Array.isArray(rule.valueFields) ? rule.valueFields.map(String) : [];
  rule.valueFields = checked
    ? Array.from(new Set([...existing, field]))
    : existing.filter(item => item !== field);
}

function selectPalette(rule: Rule, palette: string): void {
  rule.selectedPalette = palette;
  if (colorPalettes[palette]) {
    rule.colorScale = [...colorPalettes[palette].colors];
  }
  rule.textColorScale ??= ['#000000', '#000000'];
}

function selectPaletteFromEvent(rule: Rule, event: Event): void {
  const target = event.target;
  selectPalette(rule, target instanceof HTMLSelectElement ? target.value : '');
}

function toggleValueFieldFromEvent(rule: Rule, field: string, event: Event): void {
  const target = event.target;
  toggleValueField(rule, field, target instanceof HTMLInputElement && target.checked);
}

function toggleDisplayOverrideFromEvent(rule: Rule, event: Event): void {
  const target = event.target;
  toggleDisplayOverride(rule, target instanceof HTMLInputElement && target.checked);
}

function colorScale(rule: Rule): string[] {
  return Array.isArray(rule.colorScale) ? rule.colorScale.map(String) : [];
}

function textColorScale(rule: Rule): string[] {
  return Array.isArray(rule.textColorScale) ? rule.textColorScale.map(String) : [];
}

function valueFieldChecked(rule: Rule, field: string): boolean {
  return Array.isArray(rule.valueFields) && rule.valueFields.map(String).includes(field);
}

function updateColor(rule: Rule, key: 'colorScale' | 'textColorScale', index: number, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const colors = key === 'colorScale' ? colorScale(rule) : textColorScale(rule);
  colors[index] = target.value;
  rule[key] = colors;
  if (key === 'colorScale') rule.selectedPalette = '';
}

function addColor(rule: Rule, key: 'colorScale' | 'textColorScale'): void {
  const colors = Array.isArray(rule[key]) ? rule[key] as string[] : [];
  const fallback = '#000000';
  colors.push(colors[colors.length - 1] ?? fallback);
  rule[key] = colors;
  if (key === 'colorScale') rule.selectedPalette = '';
}

function removeColor(rule: Rule, key: 'colorScale' | 'textColorScale', index: number): void {
  const colors = Array.isArray(rule[key]) ? rule[key] as string[] : [];
  const minimum = key === 'colorScale' ? 2 : 1;
  if (colors.length > minimum) colors.splice(index, 1);
  if (key === 'colorScale') rule.selectedPalette = '';
}

function onFormatTypeChange(rule: Rule): void {
  if (rule.formatType === 'colorScale') {
    if (!Array.isArray(rule.colorScale) || rule.colorScale.length < 2) {
      rule.colorScale = ['#e3f2fd', '#42a5f5', '#0d47a1'];
      rule.selectedPalette = 'blueScale';
    }
    if (!Array.isArray(rule.textColorScale)) {
      rule.textColorScale = ['#000000', '#000000'];
    }
    if (rule.autoTextColor === undefined) {
      rule.autoTextColor = true;
    }
    if (!Array.isArray(rule.valueFields)) {
      rule.valueFields = [];
    }
  }
}

function onApplyToChange(rule: Rule): void {
  if (rule.applyTo === 'column') {
    rule.row = '';
  } else if (rule.applyTo === 'row') {
    rule.column = '';
  }
}

function fieldEntries(text: string): Array<{ label: string; value: string }> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.flatMap(item => {
          if (typeof item === 'string') return [{ label: item, value: item }];
          if (!item || typeof item !== 'object') return [];
          const record = item as Record<string, unknown>;
          const value = stringValue(record.field);
          if (!value) return [];
          return [{ value, label: stringValue(record.customLabel) ?? stringValue(record.label) ?? value }];
        });
      }
    } catch {
      return [];
    }
  }
  return trimmed.split(',').map(item => item.trim()).filter(Boolean).map(value => ({ value, label: value }));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
</script>

<template>
  <div v-if="open" class="manual-modal-overlay" @click.self="closeDialog">
    <section ref="dialogEl" class="legacy-modal legacy-modal--large" role="dialog" aria-modal="true" aria-label="Manage conditional formatting" tabindex="-1" @keydown.esc="closeDialog">
      <header class="legacy-modal-header">
        <h3>Manage Conditional Formatting</h3>
        <button type="button" class="legacy-icon-btn" aria-label="Close conditional formatting" @click="closeDialog">&times;</button>
      </header>

      <div class="legacy-modal-body">
        <p v-if="parseError" class="legacy-error" role="alert">{{ parseError }}</p>

        <article v-for="(rule, index) in rules" :key="index" class="legacy-rule-card">
          <div class="legacy-rule-header">
            <strong>Rule #{{ index + 1 }}</strong>
            <button type="button" class="legacy-icon-btn legacy-danger" aria-label="Remove conditional formatting rule" @click="removeRule(index)">&times;</button>
          </div>

          <div class="legacy-rule-body">
            <template v-if="mode === 'matrix'">
              <label>Format Type
                <select v-model="rule.formatType" class="legacy-select" @change="onFormatTypeChange(rule)">
                  <option value="rules">Rules-Based</option>
                  <option value="colorScale">Color Scale (Heatmap)</option>
                </select>
              </label>

              <div v-if="rule.formatType === 'colorScale'" class="legacy-subsection">
                <div class="legacy-grid legacy-grid--2">
                  <label>Apply To
                    <select v-model="rule.applyTo" class="legacy-select" @change="onApplyToChange(rule)">
                      <option value="values">Cell Values</option>
                      <option value="column">Column</option>
                      <option value="row">Row</option>
                    </select>
                  </label>
                  <label>Color Palette
                    <select class="legacy-select" :value="rule.selectedPalette ?? ''" @change="selectPaletteFromEvent(rule, $event)">
                      <option value="">Custom</option>
                      <option v-for="(palette, name) in colorPalettes" :key="name" :value="name">{{ palette.name }}</option>
                    </select>
                  </label>
                </div>
                <div v-if="rule.applyTo === 'values'" class="legacy-subsection">
                  <span>Value Field(s)</span>
                  <label v-for="field in valueOptions" :key="field.value" class="legacy-inline">
                    <input type="checkbox" :checked="valueFieldChecked(rule, field.value)" @change="toggleValueFieldFromEvent(rule, field.value, $event)" />
                    {{ field.label }}
                  </label>
                </div>
                <label v-if="rule.applyTo === 'column'">Column Field<select v-model="rule.column" class="legacy-select"><option v-for="field in columnOptions" :key="field.value" :value="field.value">{{ field.label }}</option></select></label>
                <label v-if="rule.applyTo === 'row'">Row Field<select v-model="rule.row" class="legacy-select"><option v-for="field in rowOptions" :key="field.value" :value="field.value">{{ field.label }}</option></select></label>
                <div v-if="colorScale(rule).length" class="legacy-palette-preview"><span v-for="color in colorScale(rule)" :key="color" :style="{ backgroundColor: color }"></span></div>
                <div class="legacy-color-row">
                  <input v-for="(color, colorIndex) in colorScale(rule)" :key="colorIndex" :value="color" type="color" class="legacy-color-swatch" @input="updateColor(rule, 'colorScale', colorIndex, $event)" />
                  <button v-if="colorScale(rule).length < 5" type="button" class="legacy-btn" @click="addColor(rule, 'colorScale')">+ Add Color</button>
                  <button v-if="colorScale(rule).length > 2" type="button" class="legacy-btn" @click="removeColor(rule, 'colorScale', colorScale(rule).length - 1)">Remove</button>
                </div>
                <div class="legacy-color-row">
                  <input v-for="(color, colorIndex) in textColorScale(rule)" :key="colorIndex" :value="color" type="color" class="legacy-color-swatch" @input="updateColor(rule, 'textColorScale', colorIndex, $event)" />
                  <button v-if="textColorScale(rule).length < 5" type="button" class="legacy-btn" @click="addColor(rule, 'textColorScale')">+ Add Color</button>
                </div>
                <label class="legacy-inline"><input v-model="rule.autoTextColor" type="checkbox" /> Auto-adjust text color for contrast</label>
              </div>
            </template>

            <div v-if="mode === 'table' || rule.formatType !== 'colorScale'" class="legacy-grid legacy-grid--2">
              <label>{{ mode === 'matrix' ? 'Apply To' : 'Column' }}
                <select v-if="mode === 'matrix'" v-model="rule.applyTo" class="legacy-select" @change="onApplyToChange(rule)">
                  <option value="column">Column</option>
                  <option value="row">Row</option>
                </select>
                <select v-else v-model="rule.column" class="legacy-select"><option v-for="field in fieldOptions" :key="field.value" :value="field.value">{{ field.label }}</option></select>
              </label>
              <label v-if="mode === 'matrix' && rule.applyTo === 'column'">Column Field<select v-model="rule.column" class="legacy-select"><option v-for="field in columnOptions" :key="field.value" :value="field.value">{{ field.label }}</option></select></label>
              <label v-if="mode === 'matrix' && rule.applyTo === 'row'">Row Field<select v-model="rule.row" class="legacy-select"><option v-for="field in rowOptions" :key="field.value" :value="field.value">{{ field.label }}</option></select></label>
              <label>Operator<select v-model="rule.operator" class="legacy-select"><option value="==">=</option><option value="!=">Not equal</option><option value=">">Greater than</option><option value="<">Less than</option><option value=">=">Greater/equal</option><option value="<=">Less/equal</option><option value="contains">contains</option><option value="startsWith">starts with</option><option value="endsWith">ends with</option><option value="IN">IN</option><option value="NOT IN">NOT IN</option></select></label>
              <label>Value<input v-model="rule.value" class="legacy-input" placeholder="Comparison value" /></label>
              <label>Scope<select v-model="rule.scope" class="legacy-select"><option value="cell">Cell Only</option><option value="row">Entire Row</option><option value="column">Entire Column</option></select></label>
              <label v-if="mode === 'table' && rule.scope === 'cell'">Target Cell<select v-model="rule.scopeCell" class="legacy-select"><option v-for="field in fieldOptions" :key="field.value" :value="field.value">{{ field.label }}</option></select></label>
            </div>

            <div v-if="mode === 'table' || rule.formatType !== 'colorScale'" class="legacy-rule-section">
              <h4>Style</h4>
              <div class="legacy-grid legacy-grid--2">
                <label>Background
                  <input v-model="rule.bgColor" :disabled="rule.disableBg === true" type="color" class="legacy-color-swatch" />
                </label>
                <label>Text
                  <input v-model="rule.textColor" :disabled="rule.disableText === true" type="color" class="legacy-color-swatch" />
                </label>
              </div>
              <div class="legacy-checkbox-grid">
                <label class="legacy-inline"><input v-model="rule.bold" type="checkbox" /> Bold</label>
                <label class="legacy-inline"><input v-model="rule.italic" type="checkbox" /> Italic</label>
              </div>
            </div>

            <div v-if="mode === 'table'" class="legacy-rule-section">
              <h4>Behavior</h4>
              <div class="legacy-checkbox-grid">
                <label class="legacy-inline"><input v-model="rule.disableBg" type="checkbox" /> Do not change background</label>
                <label class="legacy-inline"><input v-model="rule.disableText" type="checkbox" /> Do not change text color</label>
                <label class="legacy-inline"><input type="checkbox" :checked="Object.prototype.hasOwnProperty.call(rule, 'displayValue')" @change="toggleDisplayOverrideFromEvent(rule, $event)" /> Override cell value</label>
              </div>
              <label v-if="Object.prototype.hasOwnProperty.call(rule, 'displayValue')">Override Value
                <input v-model="rule.displayValue" class="legacy-input" placeholder="Override display" />
              </label>
            </div>
          </div>
        </article>

        <button type="button" class="legacy-btn legacy-btn--primary" @click="addRule">+ Add Formatting Rule</button>

        <div v-if="rules.length === 0" class="legacy-empty">
          <strong>No conditional formatting rules defined</strong>
          <span>Add rules to highlight cells, rows, columns, or heatmap values.</span>
        </div>
      </div>

      <footer class="legacy-modal-footer">
        <button type="button" class="legacy-btn legacy-btn--primary" @click="closeDialog">Done</button>
      </footer>
    </section>
  </div>
</template>
