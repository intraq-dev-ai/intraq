<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import ProfileDropdown from '../../shell/ProfileDropdown.vue';
import { readEffectiveRole, roleLabel } from '../../shell/role-context';
import { useTenantBranding } from '../../shell/useTenantBranding';
import { chooseTableForPrompt } from '../agent-context/element-planner';
import { modelLabel } from '../dashboard-sidebar-model';
import DashboardListPanel from './DashboardListPanel.vue';
import DashboardWorkspaceChatMessages from './DashboardWorkspaceChatMessages.vue';
import { useDashboardChatInput } from './useDashboardChatInput';
import type {
  DashboardAgentMessage,
  BuilderActionPlan,
  BuilderDataSource,
  BuilderDataTable,
  BuilderModelContextSummary,
  Dashboard,
  DashboardElement,
  DashboardSuggestion,
  DataModelRecommendation
} from '../types';

const props = defineProps<{
  actionPlan: BuilderActionPlan | null;
  agentMessages: DashboardAgentMessage[];
  aiFeaturesEnabled?: boolean;
  canEditDashboard: boolean;
  canUseDashboard: boolean;
  dataModelRecommendation: DataModelRecommendation | null;
  dataSources: BuilderDataSource[];
  dashboards: Dashboard[];
  builderRailCollapsed: boolean;
  selectedDashboard: Dashboard | null;
  selectedDataSourceId: string;
  selectedElement: DashboardElement | null;
  selectedTableId: string;
  selectedTable: BuilderDataTable | null;
  showBuilderRail: boolean;
  lastAgentPrompt: string;
  prompt: string;
  recentDashboardId: string;
  samplePrompts: string[];
  suggestions: DashboardSuggestion[];
  status: string;
  modelContextError: string;
  modelContextSummary: BuilderModelContextSummary | null;
  error: string;
}>();

const emit = defineEmits<{
  'update:prompt': [value: string];
  createElement: [];
  createManualElement: [type: string, chartType?: string];
  clearElementSelection: [];
  messageAction: [actionId: string, messageId: string];
  newDashboard: [name: string, prompt?: string];
  applyToSelectedElement: [];
  selectDataSource: [id: string];
  selectDataTable: [id: string];
  toggleBuilderRail: [];
}>();

const currentUserName = ref('intraQ User');
const currentUserEmail = ref('Signed in user');
const currentRoleKey = ref(readEffectiveRole());
const currentUserRole = ref(roleLabel(currentRoleKey.value));
const { tenantBranding } = useTenantBranding();
const isAiLoading = computed(() => props.agentMessages.at(-1)?.role === 'assistant' && props.agentMessages.at(-1)?.kind === 'loading');
const orderedDataSources = computed(() => [...props.dataSources].sort((left, right) => {
  const leftDefault = left.settings?.dashboard?.isDefault === true ? 1 : 0;
  const rightDefault = right.settings?.dashboard?.isDefault === true ? 1 : 0;
  if (leftDefault !== rightDefault) return rightDefault - leftDefault;
  return left.name.localeCompare(right.name);
}));
const currentDataSource = computed(() =>
  orderedDataSources.value.find(source => source.id === props.selectedDataSourceId) ?? orderedDataSources.value[0] ?? null
);
const recommendedTable = computed(() => {
  if (!currentDataSource.value || props.selectedElement) return null;
  return chooseTableForPrompt(currentDataSource.value, props.prompt, props.selectedTableId, { allowSelectedFallback: false });
});
const orderedTables = computed(() => {
  const source = currentDataSource.value;
  if (!source) return [];
  const recommendedId = recommendedTable.value?.id ?? '';
  return [...source.tables].sort((left, right) => {
    const leftRecommended = left.id === recommendedId ? 1 : 0;
    const rightRecommended = right.id === recommendedId ? 1 : 0;
    if (leftRecommended !== rightRecommended) return rightRecommended - leftRecommended;
    return tableLabel(left).localeCompare(tableLabel(right));
  });
});

const {
  inputRef: chatInputRef,
  mentionActive,
  mentionIndex,
  groupedOptions: mentionGroups,
  filteredOptions: mentionOptions,
  onInput: onChatInput,
  onKeydown: onChatKeydown,
  insertMention,
  closeMention
} = useDashboardChatInput({
  getPrompt: () => props.prompt,
  setPrompt: (v) => emit('update:prompt', v),
  onSubmit: () => props.selectedElement ? emit('applyToSelectedElement') : emit('createElement'),
  onCommand: (cmd) => handleSlashCommand(cmd),
  selectedTable: () => props.selectedTable,
  dataSources: () => props.dataSources,
  dashboardElements: () => props.selectedDashboard?.elements ?? []
});
const chatPlaceholder = computed(() => {
  if (!props.selectedDataSourceId) return 'Select a data source to start...';
  if (props.selectedElement) return `Ask AI to update ${props.selectedElement.name}...`;
  return 'Ask AI... use @ for fields, # for models, / for commands';
});

function inputValue(event: Event): string {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
    return event.target.value;
  }
  return '';
}

function fieldNames(table: BuilderDataTable | null, type: 'dimension' | 'measure'): string[] {
  const fields = table?.fields ?? [];
  const matches = fields.filter(field => type === 'measure' ? field.type === 'number' : field.type !== 'number');
  return matches.slice(0, 4).map(field => field.name);
}

function tableLabel(table: BuilderDataTable): string {
  return table.dictionary?.businessName ?? modelLabel(table.name);
}

function setPrompt(value: string): void {
  emit('update:prompt', value);
}

function handleSlashCommand(cmd: string): void {
  if (cmd === '/clear') {
    // Clear the conversation — emit an empty createElement to reset, or tell parent
    emit('update:prompt', '');
    // Inject a clear instruction as the prompt then submit
    emit('update:prompt', 'Clear the conversation history');
    void nextTick(() => emit('createElement'));
    return;
  }
  if (cmd === '/create') {
    emit('clearElementSelection');
    return;
  }
  if (cmd === '/update') {
    // keep selection, just focus the prompt
    chatInputRef.value?.focus();
    return;
  }
  if (cmd === '/suggest') {
    emit('update:prompt', 'Suggest a dashboard layout for this data');
    void nextTick(() => emit('createElement'));
  }
}

function createDashboardFromMenu(name = 'New Dashboard', prompt?: string): void {
  emit('newDashboard', name, prompt);
}

function syncUserProfile(): void {
  currentUserName.value = storedValue(['userName', 'name', 'displayName']) ?? 'intraQ User';
  currentUserEmail.value = storedValue(['userEmail', 'email', 'username']) ?? 'Signed in user';
  currentRoleKey.value = readEffectiveRole();
  currentUserRole.value = roleLabel(currentRoleKey.value);
}

function storedValue(keys: string[]): string | undefined {
  if (typeof window === 'undefined') return undefined;
  for (const key of keys) {
    const value = window.localStorage.getItem(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

onMounted(() => {
  syncUserProfile();
  window.addEventListener('intraq-session-updated', syncUserProfile);
  window.addEventListener('storage', syncUserProfile);
});

onBeforeUnmount(() => {
  window.removeEventListener('intraq-session-updated', syncUserProfile);
  window.removeEventListener('storage', syncUserProfile);
});
</script>

<template>
  <div class="dashboard-sidebars" :class="{
    'dashboard-sidebars--edit': showBuilderRail,
    'dashboard-sidebars--view': !showBuilderRail,
    'dashboard-sidebars--collapsed': showBuilderRail && builderRailCollapsed
  }">
    <aside
      v-if="showBuilderRail"
      class="builder-sidebar dashboard-ai-sidebar"
      :class="{ 'builder-sidebar--collapsed': builderRailCollapsed }"
      aria-label="Dashboard sidebar"
    >
      <header class="ai-chat-branding-top" aria-label="Dashboard builder controls">
        <div class="ai-chat-branding-left" aria-label="Dashboard builder product mark">
          <div class="ai-chat-brand-text">
            <span class="ai-chat-brand-title">{{ tenantBranding.displayName }}</span>
            <span v-if="tenantBranding.subHeader" class="ai-chat-brand-subtitle">{{ tenantBranding.subHeader }}</span>
          </div>
        </div>
        <ProfileDropdown
          :user-name="currentUserName"
          :user-email="currentUserEmail"
          :user-role="currentUserRole"
          :role-key="currentRoleKey"
          variant="dark"
        />
      </header>

      <section class="ai-agent-panel ai-chat-container" aria-label="AI dashboard builder">
        <section class="selected-data-source ai-context-panel" aria-label="AI data model context">
          <div class="data-source-highlight">
            <label class="datasource-meta-left" for="builder-data-source">
              <span class="meta-label">Data source</span>
              <select
                id="builder-data-source"
                class="data-source-dropdown"
                aria-label="Data source"
                :value="selectedDataSourceId"
                @change="emit('selectDataSource', inputValue($event))"
              >
                <option v-for="source in orderedDataSources" :key="source.id" :value="source.id">
                  {{ source.name }}
                </option>
              </select>
            </label>
            <label class="datasource-meta-left" for="builder-data-model">
              <span class="meta-label">Data model</span>
              <select
                id="builder-data-model"
                class="data-model-dropdown"
                aria-label="Data model"
                :value="selectedTableId"
                :disabled="!selectedDataSourceId"
                @change="emit('selectDataTable', inputValue($event))"
              >
                <option
                  v-if="orderedTables.length === 0"
                  value=""
                  disabled
                >
                  No data models available
                </option>
                <option
                  v-for="table in orderedTables"
                  :key="table.id"
                  :value="table.id"
                >
                  #{{ tableLabel(table) }}
                </option>
              </select>
            </label>
            <div v-if="recommendedTable && selectedTable?.id !== recommendedTable.id" class="model-suggestion-row">
              <span class="model-suggestion-copy">Suggested: #{{ tableLabel(recommendedTable) }}</span>
              <button
                type="button"
                class="model-suggestion-btn"
                :aria-label="`Use suggested model ${tableLabel(recommendedTable)}`"
                @click="emit('selectDataTable', recommendedTable.id)"
              >
                Use suggested
              </button>
            </div>
          </div>
        </section>

        <DashboardWorkspaceChatMessages
          :agent-messages="agentMessages"
          :selected-element="selectedElement"
          @message-action="(actionId, messageId) => emit('messageAction', actionId, messageId)"
        />

        <div v-if="selectedElement" class="editing-bar" aria-label="Selected AI chart editor target">
          <span class="editing-bar-label">Editing:</span>
          <span class="editing-bar-name" :title="selectedElement.name">{{ selectedElement.name }}</span>
          <button type="button" class="editing-bar-clear" :aria-label="`Stop editing ${selectedElement.name}`" @click="emit('clearElementSelection')">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/></svg>
          </button>
        </div>

        <form class="ai-chat-input" @submit.prevent="selectedElement ? emit('applyToSelectedElement') : emit('createElement')">
          <div class="input-container" @click="chatInputRef?.focus()">
            <!-- Mention dropdown -->
            <div v-if="mentionActive && mentionOptions.length > 0" class="mention-dropdown" role="listbox">
              <div v-for="grp in mentionGroups" :key="grp.group" class="mention-group">
                <div class="mention-group-label">{{ grp.group }}</div>
                <button
                  v-for="(opt, i) in grp.options"
                  :key="opt.value"
                  type="button"
                  role="option"
                  class="mention-option"
                  :class="{ active: mentionOptions.indexOf(opt) === mentionIndex }"
                  @mousedown.prevent="insertMention(opt)"
                >
                  <svg v-if="opt.icon === 'field'" class="mention-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 12h6M9 16h6M9 8h6M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
                  <svg v-else-if="opt.icon === 'table'" class="mention-icon mention-icon-db" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>
                  <svg v-else-if="opt.icon === 'command'" class="mention-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
                  <svg v-else class="mention-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  <span class="mention-label">{{ opt.label }}</span>
                </button>
              </div>
            </div>
            <span id="builder-prompt-label" class="sr-only">Business question</span>
            <div
              id="builder-prompt"
              ref="chatInputRef"
              class="chat-contenteditable"
              role="textbox"
              aria-multiline="true"
              aria-labelledby="builder-prompt-label"
              :contenteditable="canUseDashboard && !!selectedDataSourceId ? 'true' : 'false'"
              :data-placeholder="chatPlaceholder"
              @input="onChatInput"
              @keydown="onChatKeydown"
              @blur="closeMention"
            ></div>
            <!-- Voice button -->
            <button class="voice-btn" type="button" aria-label="Voice input" title="Voice input (coming soon)" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
              </svg>
            </button>
            <!-- Stop button when loading -->
            <button
              v-if="isAiLoading"
              class="stop-btn"
              type="button"
              aria-label="Stop AI"
              title="Stop"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
            <!-- Send button -->
            <button
              v-else
              class="send-btn"
              type="submit"
              :aria-label="selectedElement ? 'Update selected element' : 'Create element'"
              :title="selectedElement ? 'Update' : 'Send'"
              :disabled="!canUseDashboard || !selectedDataSourceId || prompt.trim().length === 0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
          <div class="chat-input-hints">
            <span>Type <kbd>@</kbd> fields · <kbd>#</kbd> models · <kbd>/</kbd> commands</span>
          </div>
        </form>
      </section>

      <p class="builder-status sr-only" role="status" aria-label="Dashboard builder status" aria-live="polite">{{ status }}</p>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    </aside>
    <button
      v-if="showBuilderRail"
      class="builder-sidebar-toggle"
      type="button"
      :aria-expanded="!builderRailCollapsed"
      :aria-label="builderRailCollapsed ? 'Show AI chat sidebar' : 'Hide AI chat sidebar'"
      :title="builderRailCollapsed ? 'Show AI chat' : 'Hide AI chat'"
      @click.stop="emit('toggleBuilderRail')"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline v-if="builderRailCollapsed" points="9 6 15 12 9 18" />
        <polyline v-else points="15 6 9 12 15 18" />
      </svg>
    </button>

    <DashboardListPanel
      v-if="!showBuilderRail"
      :dashboards="dashboards"
      :selected-dashboard="selectedDashboard"
      :recent-dashboard-id="recentDashboardId"
      :can-edit-dashboard="canEditDashboard"
      :user-name="currentUserName"
      :user-email="currentUserEmail"
      :user-role="currentUserRole"
      :role-key="currentRoleKey"
      :ai-features-enabled="aiFeaturesEnabled"
      @new-dashboard="createDashboardFromMenu"
    />
  </div>
</template>
