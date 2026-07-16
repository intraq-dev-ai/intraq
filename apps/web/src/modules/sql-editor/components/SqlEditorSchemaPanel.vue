<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SqlEditorAssistantPanel from './SqlEditorAssistantPanel.vue';
import type { SqlEditorParameter, SqlEditorSchema, SqlEditorSuggestion, SqlEditorTable } from '../types';
import type { SqlAssistantMessage } from '../use-sql-assistant';
import type { SqlAssistantQuickAction } from '../workflow';

type ParameterPatch = Partial<Pick<SqlEditorParameter, 'dataType' | 'dateRole' | 'defaultValue' | 'description' | 'required'>>;

const props = defineProps<{
  schema: SqlEditorSchema | null;
  tables: SqlEditorTable[];
  expandedTables: string[];
  aiAssistantEnabled?: boolean;
  suggestions: SqlEditorSuggestion[];
  parameters: SqlEditorParameter[];
  assistantPrompt: string;
  assistantResponse: string;
  assistantError: string;
  assistantConversationId: string;
  assistantMessages: SqlAssistantMessage[];
  assistantPlaceholder: string;
  assistantStatus: string;
  assistantDataSourceName: string;
  canApplyAssistantSql: boolean;
  canStopAssistant: boolean;
  currentQuery: string;
  hasDataSource: boolean;
  isAssistantRunning: boolean;
}>();

const emit = defineEmits<{
  collapseAllTables: [];
  expandTables: [tableNames: string[]];
  expandAllTables: [];
  insertColumn: [tableName: string, columnName: string];
  toggleTable: [tableName: string];
  useTable: [table: SqlEditorTable];
  insertTable: [table: SqlEditorTable];
  applySuggestion: [suggestion: SqlEditorSuggestion];
  runAssistant: [];
  runAssistantQuickAction: [action: SqlAssistantQuickAction];
  applyAssistantSql: [content?: string];
  replaceAssistantSql: [content?: string];
  askExample: [question: string];
  newAssistantChat: [];
  resetAssistantSession: [];
  stopAssistant: [];
  updateAssistantPrompt: [value: string];
  updateParameterMetadata: [name: string, patch: ParameterPatch];
  renameParameter: [name: string, nextName: string];
  removeParameter: [name: string];
}>();

const TABLE_RENDER_BATCH_SIZE = 80;

function tableRegionId(tableName: string): string {
  return `sql-editor-table-${tableName.replace(/[^a-z0-9_-]/gi, '-')}`;
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function checkboxValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

function dataTypeValue(event: Event): SqlEditorParameter['dataType'] {
  const value = inputValue(event);
  if (value === 'boolean' || value === 'date' || value === 'datetime' || value === 'number') return value;
  return 'string';
}

function dateRoleValue(event: Event): SqlEditorParameter['dateRole'] {
  const value = inputValue(event);
  return value === 'start' || value === 'end' || value === 'as_of' ? value : 'none';
}

const activePanel = ref<'assistant' | 'tables' | 'parameters'>(props.aiAssistantEnabled === false ? 'tables' : 'assistant');
const searchQuery = ref('');
const visibleTableCount = ref(TABLE_RENDER_BATCH_SIZE);

const tableSearchIndex = computed(() => props.tables.map(table => {
  const columnText = table.columns.map(column => [
    column.name,
    column.label,
    column.type,
    column.description
  ].join(' ')).join(' ');
  return {
    table,
    nameText: table.name.toLowerCase(),
    searchableText: [
      table.name,
      table.description,
      columnText
    ].join(' ').toLowerCase()
  };
}));

const filteredTables = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.tables;
  return tableSearchIndex.value
    .filter(entry => entry.searchableText.includes(query))
    .map(entry => entry.table);
});

const visibleTables = computed(() => filteredTables.value.slice(0, visibleTableCount.value));
const remainingTableCount = computed(() => Math.max(0, filteredTables.value.length - visibleTables.value.length));

watch(searchQuery, () => {
  visibleTableCount.value = TABLE_RENDER_BATCH_SIZE;
});

watch(() => props.tables, () => {
  visibleTableCount.value = TABLE_RENDER_BATCH_SIZE;
});

watch(() => props.aiAssistantEnabled, enabled => {
  if (enabled === false && activePanel.value === 'assistant') activePanel.value = 'tables';
});

function isTableExpanded(tableName: string): boolean {
  return props.expandedTables.includes(tableName);
}

function tableMatchesSearch(table: SqlEditorTable): boolean {
  const query = searchQuery.value.trim().toLowerCase();
  return query.length > 0 && table.name.toLowerCase().includes(query);
}

function shouldShowColumns(table: SqlEditorTable): boolean {
  if (isTableExpanded(table.name)) return true;
  const query = searchQuery.value.trim();
  return query.length > 0 && !tableMatchesSearch(table) && filteredColumns(table).length > 0;
}

function filteredColumns(table: SqlEditorTable): SqlEditorTable['columns'] {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query || table.name.toLowerCase().includes(query)) return table.columns;
  return table.columns.filter(column =>
    column.name.toLowerCase().includes(query)
      || column.label.toLowerCase().includes(query)
      || column.type.toLowerCase().includes(query)
      || column.description.toLowerCase().includes(query));
}

function rowCountLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function showMoreTables(): void {
  visibleTableCount.value += TABLE_RENDER_BATCH_SIZE;
}

function expandVisibleTables(): void {
  emit('expandTables', visibleTables.value.map(table => table.name));
}

function isDateLike(param: SqlEditorParameter): boolean {
  return param.dataType === 'date' || param.dataType === 'datetime';
}

function parameterSyntax(param: SqlEditorParameter): string {
  return param.required ? `{{${param.name}}}` : `[[{{${param.name}}}]]`;
}

// A Start/End date role can only be assigned to one required date parameter at a time (legacy parity).
function isDateRoleOptionDisabled(current: SqlEditorParameter, role: 'end' | 'start'): boolean {
  return props.parameters.some(param =>
    param !== current && isDateLike(param) && param.required && param.dateRole === role);
}

</script>

<template>
  <aside class="sql-editor-schema-panel" aria-labelledby="sql-schema-title">
    <div class="sql-editor-right-tabs" role="tablist" aria-label="SQL editor side panels">
      <button v-if="aiAssistantEnabled !== false" type="button" role="tab" aria-label="AI SQL Assistant" title="AI SQL Assistant" :aria-selected="activePanel === 'assistant'" @click="activePanel = 'assistant'">
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
      </button>
      <button type="button" role="tab" aria-label="Tables" title="Database Tables" :aria-selected="activePanel === 'tables'" @click="activePanel = 'tables'">
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10"/></svg>
      </button>
      <button type="button" role="tab" aria-label="Params" title="Query Parameters" :aria-selected="activePanel === 'parameters'" @click="activePanel = 'parameters'">
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0-4-4m4 4-4 4m0 6H4m0 0 4 4m-4-4 4-4"/></svg>
      </button>
    </div>

    <SqlEditorAssistantPanel
      v-if="aiAssistantEnabled !== false"
      :class="{ 'is-active': activePanel === 'assistant' }"
      :suggestions="suggestions"
      :assistant-prompt="assistantPrompt"
      :assistant-response="assistantResponse"
      :assistant-conversation-id="assistantConversationId"
      :assistant-messages="assistantMessages"
      :assistant-error="assistantError"
      :assistant-status="assistantStatus"
      :assistant-placeholder="assistantPlaceholder"
      :assistant-data-source-name="assistantDataSourceName"
      :current-query="currentQuery"
      :has-data-source="hasDataSource"
      :is-assistant-running="isAssistantRunning"
      :can-apply-assistant-sql="canApplyAssistantSql"
      :can-stop-assistant="canStopAssistant"
      @update-assistant-prompt="emit('updateAssistantPrompt', $event)"
      @new-assistant-chat="emit('newAssistantChat')"
      @reset-assistant-session="emit('resetAssistantSession')"
      @run-assistant="emit('runAssistant')"
      @run-assistant-quick-action="emit('runAssistantQuickAction', $event)"
      @stop-assistant="emit('stopAssistant')"
      @apply-assistant-sql="emit('applyAssistantSql', $event)"
      @replace-assistant-sql="emit('replaceAssistantSql', $event)"
      @ask-example="emit('askExample', $event)"
      @apply-suggestion="emit('applySuggestion', $event)"
    />

    <section class="sql-editor-right-content" :class="{ 'is-active': activePanel === 'tables' }" aria-labelledby="sql-schema-title">
      <div class="sql-editor-panel-heading">
        <div class="sql-editor-panel-title">
          <h2 id="sql-schema-title">Database Tables</h2>
          <p class="muted">
            {{ tables.length }} table{{ tables.length === 1 ? '' : 's' }} visible
            <span v-if="schema && filteredTables.length !== tables.length">, {{ filteredTables.length }} matched</span>
          </p>
        </div>
        <div class="sql-editor-action-row">
          <button type="button" class="sql-editor-secondary-button" title="Expand visible tables" @click="expandVisibleTables">Expand all</button>
          <button type="button" class="sql-editor-secondary-button" @click="emit('collapseAllTables')">Collapse all</button>
        </div>
      </div>
      <label v-if="schema" class="sql-editor-search-field">
        <span class="sr-only">Search tables and columns</span>
        <input v-model="searchQuery" type="search" placeholder="Search tables and columns..." aria-label="Search tables and columns" />
      </label>
      <ul v-if="schema && filteredTables.length" class="sql-editor-table-list" aria-label="Tables in selected data source">
        <li v-for="table in visibleTables" :key="table.name" class="sql-editor-table-item">
          <div class="sql-editor-table-summary">
            <button
              type="button"
              class="sql-editor-table-toggle"
              :aria-expanded="isTableExpanded(table.name)"
              :aria-controls="tableRegionId(table.name)"
              @click="emit('toggleTable', table.name)"
            >
              <svg
                class="sql-editor-table-chevron"
                :class="{ expanded: isTableExpanded(table.name) }"
                aria-hidden="true"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7"/>
              </svg>
              <svg class="sql-editor-table-icon" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10"/>
              </svg>
              <span class="sql-editor-table-name">{{ table.name }}</span>
              <span v-if="rowCountLabel(table.rowCount)" class="sql-editor-table-count" aria-hidden="true">{{ rowCountLabel(table.rowCount) }}</span>
            </button>
            <button type="button" class="sql-editor-secondary-button sql-editor-table-use" @click="emit('useTable', table)">
              Use
            </button>
            <button type="button" class="sql-editor-icon-button sql-editor-table-insert" :aria-label="`Insert table ${table.name}`" :title="`Insert table ${table.name}`" @click="emit('insertTable', table)">
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m6-6H6"/></svg>
            </button>
          </div>
          <p v-if="table.description" class="sql-editor-table-description">{{ table.description }}</p>
          <div
            v-if="shouldShowColumns(table)"
            :id="tableRegionId(table.name)"
            :aria-label="`Columns for ${table.name}`"
            class="sql-editor-column-list"
            role="table"
          >
            <button
              v-for="column in filteredColumns(table)"
              :key="column.name"
              type="button"
              class="sql-editor-column-item"
              :aria-label="`Insert column ${column.name}`"
              @click="emit('insertColumn', table.name, column.name)"
            >
              <span class="sql-editor-column-main">
                <svg class="sql-editor-column-icon" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414A1 1 0 0 1 19 8.414V19a2 2 0 0 1-2 2z"/>
                </svg>
                <span class="sql-editor-column-name">{{ column.name }}</span>
              </span>
              <span class="sql-editor-column-type">{{ column.type }}</span>
            </button>
          </div>
        </li>
        <li v-if="remainingTableCount > 0" class="sql-editor-table-list-more">
          <button type="button" class="sql-editor-secondary-button" @click="showMoreTables">
            Show {{ Math.min(remainingTableCount, TABLE_RENDER_BATCH_SIZE) }} more
          </button>
          <span>{{ remainingTableCount }} hidden for performance</span>
        </li>
      </ul>
      <p v-else-if="schema" class="muted sql-editor-empty-state">No matching tables or columns.</p>
      <p v-else class="muted">Choose a data source to view tables.</p>
    </section>

    <section class="sql-editor-right-content" :class="{ 'is-active': activePanel === 'parameters' }" aria-label="Detected parameters">
      <div class="sql-editor-panel-heading">
        <div class="sql-editor-panel-title">
          <h2>Query Parameters</h2>
          <p class="muted">{{ parameters.length }} parameter{{ parameters.length === 1 ? '' : 's' }} detected.</p>
        </div>
      </div>
      <div v-if="parameters.length" class="sql-editor-parameter-editor-list">
        <article v-for="param in parameters" :key="param.id" class="sql-editor-parameter-editor sql-optional-parameter-card">
          <div class="sql-editor-parameter-header">
            <span class="sql-editor-parameter-eyebrow">Variable name</span>
            <button type="button" class="sql-editor-icon-button" :aria-label="`Remove ${param.name} parameter`" title="Remove Variable" @click="emit('removeParameter', param.name)">
              <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <label class="sql-editor-field">
            <span class="sr-only">{{ param.name }} parameter name</span>
            <input class="sql-editor-variable-name-input" :value="param.name" placeholder="Variable name" @change="emit('renameParameter', param.name, inputValue($event))" />
          </label>
          <label class="sql-editor-field">
            <span>Variable type</span>
            <select
              :aria-label="`${param.name} variable type`"
              :value="param.dataType"
              @change="emit('updateParameterMetadata', param.name, { dataType: dataTypeValue($event) })"
            >
              <option value="string">📝 Text</option>
              <option value="number">🔢 Number</option>
              <option value="date">📅 Date</option>
              <option value="datetime">🕐 Date &amp; Time</option>
              <option value="boolean">☑️ Boolean</option>
            </select>
          </label>
          <label v-if="isDateLike(param)" class="sql-editor-field">
            <span>Date role</span>
            <select
              :aria-label="`${param.name} date role`"
              :value="param.dateRole === 'none' ? '' : param.dateRole"
              @change="emit('updateParameterMetadata', param.name, { dateRole: dateRoleValue($event) })"
            >
              <option value="">Not set</option>
              <option value="start" :disabled="isDateRoleOptionDisabled(param, 'start')">Start date</option>
              <option value="end" :disabled="isDateRoleOptionDisabled(param, 'end')">End date</option>
            </select>
          </label>
          <label class="sql-editor-field">
            <span>Filter widget label</span>
            <input
              :aria-label="`${param.name} filter widget label`"
              :value="param.description"
              :placeholder="param.name"
              @input="emit('updateParameterMetadata', param.name, { description: inputValue($event) })"
            />
          </label>
          <label class="sql-editor-field">
            <span>Default filter widget value</span>
            <div class="sql-editor-default-value-container">
              <select
                v-if="isDateLike(param)"
                :aria-label="`${param.name} default filter widget value`"
                :value="param.defaultValue"
                @change="emit('updateParameterMetadata', param.name, { defaultValue: inputValue($event) })"
              >
                <option v-if="!param.required" value="">Select default value...</option>
                <option value="TODAY">Today</option>
                <option value="YESTERDAY">Yesterday</option>
                <option value="START_OF_WEEK">Start of this week</option>
                <option value="END_OF_WEEK">End of this week</option>
                <option value="START_OF_LAST_WEEK">Start of last week</option>
                <option value="END_OF_LAST_WEEK">End of last week</option>
                <option value="START_OF_MONTH">Start of this month</option>
                <option value="END_OF_MONTH">End of this month</option>
                <option value="START_OF_LAST_MONTH">Start of last month</option>
                <option value="END_OF_LAST_MONTH">End of last month</option>
                <option value="START_OF_YEAR">Start of this year</option>
                <option value="END_OF_YEAR">End of this year</option>
              </select>
              <input
                v-else
                :aria-label="`${param.name} default filter widget value`"
                :value="param.defaultValue"
                :placeholder="param.dataType === 'number' ? 'Enter number' : 'Enter value'"
                @input="emit('updateParameterMetadata', param.name, { defaultValue: inputValue($event) })"
              />
              <button
                type="button"
                class="sql-editor-clear-default-btn"
                :disabled="param.required"
                :aria-label="`Clear default value for ${param.name}`"
                title="Clear"
                @click="emit('updateParameterMetadata', param.name, { defaultValue: '' })"
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </label>
          <div class="sql-editor-toggle-section">
            <label class="sql-editor-toggle-switch">
              <input
                :aria-label="`Always require a value for ${param.name}`"
                :checked="param.required"
                type="checkbox"
                @change="emit('updateParameterMetadata', param.name, { required: checkboxValue($event) })"
              />
              <span class="sql-editor-toggle-slider"></span>
            </label>
            <div class="sql-editor-toggle-content">
              <span class="sql-editor-toggle-title">Always require a value</span>
              <p class="sql-editor-toggle-description">When enabled, people can change the value or reset it, but can't clear it entirely.</p>
            </div>
          </div>
          <div class="sql-editor-syntax-hint">
            <span>Query syntax:</span>
            <code>{{ parameterSyntax(param) }}</code>
          </div>
        </article>
      </div>
      <div v-else class="sql-editor-no-parameters">
        <p>No parameters defined</p>
        <p class="muted">Add parameters using <code>{{ '{' }}{{ '{' }}ParamName{{ '}' }}{{ '}' }}</code> syntax in your query. Wrap an optional clause in <code>[[ ]]</code>.</p>
      </div>
    </section>
  </aside>
</template>
