<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { indentWithTab, toggleComment } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';
import { resolvedTheme, subscribeTheme } from '../../theme/theme';
import type { SqlEditorParameter, SqlEditorQueryHistoryItem, SqlEditorSource } from '../types';

const props = defineProps<{
  selectedSource: SqlEditorSource | null;
  query: string;
  queryHistory: SqlEditorQueryHistoryItem[];
  parameters: SqlEditorParameter[];
  parameterValues: Record<string, string>;
  error: string;
  canUndo: boolean;
  canRedo: boolean;
}>();

const emit = defineEmits<{
  updateQuery: [value: string];
  queryInput: [];
  executeQuery: [];
  undo: [];
  redo: [];
  formatQuery: [];
  clearHistory: [];
  loadHistoryQuery: [query: string];
  updateParameterValue: [name: string, value: string];
}>();

const showHistoryDropdown = ref(false);
const editorHost = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const suppressEditorUpdate = ref(false);
const themeCompartment = new Compartment();
let unsubscribeTheme: (() => void) | null = null;

function codeMirrorFrameTheme(dark: boolean) {
  return EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: dark ? '#1e1e1e' : '#ffffff',
      color: dark ? '#d4d4d4' : '#111827'
    },
    '&.cm-focused': {
      outline: 'none'
    },
    '.cm-scroller': {
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: '14px',
      lineHeight: '1.55'
    },
    '.cm-content': {
      minHeight: '260px',
      padding: '16px'
    },
    '.cm-gutters': {
      backgroundColor: dark ? '#252526' : '#f9fafb',
      color: dark ? '#858585' : '#6b7280',
      borderRight: `1px solid ${dark ? '#404040' : '#e5e7eb'}`
    },
    '.cm-activeLine': {
      backgroundColor: dark ? '#2a2d2e' : '#f3f4f6'
    },
    '.cm-activeLineGutter': {
      backgroundColor: dark ? '#2a2d2e' : '#f3f4f6'
    },
    '.cm-placeholder': {
      color: dark ? '#9ca3af' : '#6b7280',
      fontStyle: 'italic'
    }
  }, { dark });
}

function codeMirrorThemeExtension(dark: boolean) {
  return dark ? [oneDark, codeMirrorFrameTheme(true)] : codeMirrorFrameTheme(false);
}

const editorExtensions = [
  basicSetup,
  EditorView.lineWrapping,
  sql(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  placeholder('-- Enter your SQL query here...'),
  EditorView.contentAttributes.of({
    'aria-label': 'SQL query',
    'aria-multiline': 'true',
    role: 'textbox',
    spellcheck: 'false'
  }),
  EditorView.updateListener.of(update => {
    if (!update.docChanged) return;
    if (suppressEditorUpdate.value) {
      suppressEditorUpdate.value = false;
      return;
    }
    const value = update.state.doc.toString();
    emit('updateQuery', value);
    emit('queryInput');
  }),
  Prec.high(keymap.of([
    indentWithTab,
    { key: 'Mod-Enter', run: () => { emit('executeQuery'); return true; } },
    { key: 'Mod-/', run: view => toggleComment(view) },
    { key: 'Mod-z', run: () => { emit('undo'); return true; } },
    { key: 'Mod-Shift-z', run: () => { emit('redo'); return true; } },
    { key: 'Mod-y', run: () => { emit('redo'); return true; } }
  ])),
  themeCompartment.of(codeMirrorThemeExtension(resolvedTheme() === 'dark'))
];

function updateParameter(name: string, event: Event): void {
  const value = event.target instanceof HTMLInputElement ? event.target.value : '';
  emit('updateParameterValue', name, value);
}

function parameterInputType(param: SqlEditorParameter): string {
  if (param.dataType === 'number') return 'number';
  if (param.dataType === 'date') return 'date';
  if (param.dataType === 'datetime') return 'datetime-local';
  if (param.dataType === 'boolean') return 'text';
  return 'text';
}

function truncateQuery(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 78 ? `${compact.slice(0, 75)}...` : compact;
}

function formatHistoryTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

function loadHistoryQuery(item: SqlEditorQueryHistoryItem): void {
  emit('loadHistoryQuery', item.query);
  showHistoryDropdown.value = false;
}

watch(() => props.query, nextQuery => {
  const view = editorView.value;
  if (!view) return;
  const value = nextQuery ?? '';
  const current = view.state.doc.toString();
  if (current === value) return;
  suppressEditorUpdate.value = true;
  view.dispatch({
    changes: { from: 0, to: current.length, insert: value }
  });
});

onMounted(() => {
  if (!editorHost.value) return;
  unsubscribeTheme = subscribeTheme(theme => {
    editorView.value?.dispatch({
      effects: themeCompartment.reconfigure(codeMirrorThemeExtension(theme === 'dark'))
    });
  });
  editorView.value = new EditorView({
    state: EditorState.create({
      doc: props.query ?? '',
      extensions: editorExtensions
    }),
    parent: editorHost.value
  });
  void nextTick(() => editorView.value?.focus());
});

onBeforeUnmount(() => {
  unsubscribeTheme?.();
  unsubscribeTheme = null;
  editorView.value?.destroy();
  editorView.value = null;
});
</script>

<template>
  <article class="sql-editor-query-panel" aria-labelledby="sql-query-title">
    <div class="sql-editor-panel-heading">
      <div class="sql-editor-panel-title">
        <h2 id="sql-query-title">Query</h2>
        <p v-if="selectedSource" class="muted">
          {{ selectedSource.name }} is {{ selectedSource.status }} with {{ selectedSource.tableCount }} table{{ selectedSource.tableCount === 1 ? '' : 's' }}.
        </p>
      </div>
      <div class="sql-editor-action-row">
        <div v-if="queryHistory.length > 0" class="history-dropdown sql-editor-history-dropdown">
          <button
            type="button"
            class="sql-editor-icon-button history-btn"
            aria-haspopup="menu"
            :aria-expanded="showHistoryDropdown"
            aria-label="Query History"
            title="Query History"
            @click="showHistoryDropdown = !showHistoryDropdown"
          >
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
            <span class="history-count">{{ queryHistory.length }}</span>
          </button>
          <div v-if="showHistoryDropdown" class="history-dropdown-menu" role="menu" aria-label="Recent queries">
            <div class="history-header">
              <span>Recent Queries</span>
              <button type="button" class="clear-history-btn" aria-label="Clear query history" title="Clear History" @click="emit('clearHistory')">
                <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"/></svg>
              </button>
            </div>
            <div class="history-items">
              <button
                v-for="item in queryHistory"
                :key="`${item.timestamp}-${item.query}`"
                type="button"
                class="history-item"
                role="menuitem"
                @click="loadHistoryQuery(item)"
              >
                <span class="history-query">{{ truncateQuery(item.query) }}</span>
                <span class="history-meta">
                  <span class="history-datasource">{{ item.dataSourceName || 'No Data Source' }}</span>
                  <span class="history-time">{{ formatHistoryTime(item.timestamp) }}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
        <button type="button" class="sql-editor-icon-button" :disabled="!canUndo" aria-label="Undo" title="Undo" @click="emit('undo')">
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6 6-6"/></svg>
        </button>
        <button type="button" class="sql-editor-icon-button" :disabled="!canRedo" aria-label="Redo" title="Redo" @click="emit('redo')">
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10H11a8 8 0 0 0-8 8v2m18-10-6 6m6-6-6-6"/></svg>
        </button>
        <button type="button" class="sql-editor-icon-button" aria-label="Format SQL" title="Format SQL" @click="emit('formatQuery')">
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h10"/></svg>
        </button>
      </div>
    </div>

    <label class="sr-only" for="sql-query">SQL query</label>
    <div class="sql-editor-code-frame">
      <div id="sql-query" ref="editorHost" class="sql-editor-code-host"></div>
    </div>

    <section v-if="parameters.length" class="parameters-panel sql-editor-parameters" aria-label="SQL parameters">
      <div class="parameters-content">
        <div class="parameters-row">
      <label v-for="param in parameters" :key="param.id" class="parameter-item sql-editor-field">
        <span class="parameter-label">{{ param.name }}{{ param.required ? '*' : '' }} parameter</span>
        <input
          class="parameter-input"
          :value="parameterValues[param.name] ?? ''"
          :type="parameterInputType(param)"
          :placeholder="param.defaultValue || param.dataType"
          @input="updateParameter(param.name, $event)"
        />
      </label>
        </div>
      </div>
    </section>

    <div v-if="error" class="sql-editor-error" role="alert">{{ error }}</div>
  </article>
</template>
