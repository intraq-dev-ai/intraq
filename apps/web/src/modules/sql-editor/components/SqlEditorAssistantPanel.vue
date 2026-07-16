<script setup lang="ts">
import { computed, ref } from 'vue';
import SqlAssistantSqlBlock from './SqlAssistantSqlBlock.vue';
import type { SqlEditorSuggestion } from '../types';
import type { SqlAssistantMessage } from '../use-sql-assistant';
import { assistantNarrativeText, assistantSqlBlocks } from '../workflow';
import type { AssistantSqlBlock, SqlAssistantQuickAction } from '../workflow';

const quickActionsOpen = ref(false);

function runQuickAction(action: SqlAssistantQuickAction): void {
  quickActionsOpen.value = false;
  emit('runAssistantQuickAction', action);
}

const props = defineProps<{
  assistantConversationId: string;
  assistantDataSourceName: string;
  assistantError: string;
  assistantMessages: SqlAssistantMessage[];
  assistantPlaceholder: string;
  assistantPrompt: string;
  assistantResponse: string;
  assistantStatus: string;
  canApplyAssistantSql: boolean;
  canStopAssistant: boolean;
  currentQuery: string;
  hasDataSource: boolean;
  isAssistantRunning: boolean;
  suggestions: SqlEditorSuggestion[];
}>();

const emit = defineEmits<{
  applyAssistantSql: [content?: string];
  applySuggestion: [suggestion: SqlEditorSuggestion];
  askExample: [question: string];
  newAssistantChat: [];
  replaceAssistantSql: [content?: string];
  resetAssistantSession: [];
  runAssistant: [];
  runAssistantQuickAction: [action: SqlAssistantQuickAction];
  stopAssistant: [];
  updateAssistantPrompt: [value: string];
}>();

const exampleQuestions = [
  'Show me the structure of my tables',
  'Create a query to see sample data from each table',
  'Suggest some useful analysis queries for this data'
];

const quickActions: Array<{ action: SqlAssistantQuickAction; label: string }> = [
  { action: 'analyze', label: 'Analyze Query' },
  { action: 'explain', label: 'Explain' },
  { action: 'optimize', label: 'Optimize' },
  { action: 'remove-aliases', label: 'Remove Aliases' },
  { action: 'add-comments', label: 'Add Comments' },
  { action: 'format', label: 'Format' }
];

const hasCurrentQuery = computed(() => props.currentQuery.trim().length > 0);
const primaryQuickActions = computed(() => quickActions.slice(0, 2));
const secondaryQuickActions = computed(() => quickActions.slice(2));
const assistantDisplayMessages = computed(() => assistantMessagesForDisplay()
  .map((message, messageIndex) => {
    const sqlBlocks = message.role === 'assistant'
      ? displaySqlBlocks(message.content, `message-${messageIndex}`)
      : [];
    return {
      ...message,
      narrative: displayNarrative(message, sqlBlocks.length),
      sqlBlocks
    };
  })
  .filter(message => message.role === 'user' || message.narrative || message.sqlBlocks.length > 0));

function displayNarrative(message: SqlAssistantMessage, sqlBlockCount: number): string {
  if (message.role === 'user') return message.content;
  if (message.role === 'assistant' && sqlBlockCount > 0) return '';
  return assistantNarrativeText(message.content);
}

function displaySqlBlocks(content: string, prefix: string): Array<AssistantSqlBlock & { id: string }> {
  return assistantSqlBlocks(content).map((block, index) => ({
    ...block,
    id: `${prefix}-sql-${index}`
  }));
}

function assistantMessagesForDisplay(): SqlAssistantMessage[] {
  const response = props.assistantResponse.trim();
  if (!response) return props.assistantMessages;
  const responseAlreadyRendered = props.assistantMessages.some(message =>
    message.role === 'assistant' && message.content.trim() === response
  );
  return responseAlreadyRendered
    ? props.assistantMessages
    : [...props.assistantMessages, {
      id: 'assistant-response',
      role: 'assistant' as const,
      content: props.assistantResponse,
      createdAt: ''
    }];
}

function updatePrompt(event: Event): void {
  const input = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
    ? event.target.value
    : '';
  emit('updateAssistantPrompt', input);
}
</script>

<template>
  <section class="sql-editor-right-content sql-editor-ai-assistant-panel" aria-labelledby="sql-assistant-title">
    <div class="sql-editor-ai-header">
      <div class="sql-editor-ai-header-left">
        <svg class="sql-editor-ai-icon" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
        <div class="sql-editor-panel-title">
          <h2 id="sql-assistant-title">AI Assistant</h2>
        </div>
      </div>
      <div class="sql-editor-ai-header-actions">
        <button type="button" class="sql-editor-ai-header-button" :disabled="!hasDataSource || isAssistantRunning" @click="emit('newAssistantChat')">New Chat</button>
        <button type="button" class="sql-editor-ai-header-button secondary" :disabled="!hasDataSource || isAssistantRunning" @click="emit('resetAssistantSession')">Reset Session</button>
      </div>
    </div>

    <section class="sql-editor-assistant-chat" role="log" aria-label="SQL assistant conversation">
      <article v-if="!hasDataSource" class="sql-editor-assistant-message status">
        <strong>Assistant</strong>
        <p>Please select a data source from the dropdown above to enable AI SQL assistance. The AI needs to understand your database schema to provide helpful query suggestions.</p>
      </article>
      <article v-else-if="assistantDisplayMessages.length === 0" class="sql-editor-assistant-message assistant sql-editor-assistant-welcome">
        <strong>Assistant</strong>
        <p>I'm ready to help you with <strong>{{ assistantDataSourceName || 'your data source' }}</strong>! Ask me to write SQL queries, explain your data structure, or suggest useful queries for analysis.</p>
        <div class="sql-editor-example-questions">
          <div class="sql-editor-example-title">Try asking:</div>
          <button
            v-for="question in exampleQuestions"
            :key="question"
            type="button"
            class="sql-editor-example-question"
            :disabled="isAssistantRunning"
            @click="emit('askExample', question)"
          >
            "{{ question }}"
          </button>
        </div>
      </article>
      <article
        v-for="message in assistantDisplayMessages"
        :key="message.id"
        class="sql-editor-assistant-message"
        :class="message.role"
      >
        <strong>{{ message.role === 'user' ? 'You' : 'Assistant' }}</strong>
        <template v-if="message.role === 'assistant'">
          <p v-if="message.narrative">{{ message.narrative }}</p>
          <SqlAssistantSqlBlock
            v-for="block in message.sqlBlocks"
            :key="block.id"
            :sql="block.sql"
            :message-content="message.content"
            :disabled="isAssistantRunning"
            @replace="emit('replaceAssistantSql', $event)"
            @apply="emit('applyAssistantSql', $event)"
          />
        </template>
        <p v-else>{{ message.narrative }}</p>
      </article>
    </section>

    <!-- Input bar pinned at bottom -->
    <div class="sql-editor-ai-bottom-bar">
      <p v-if="assistantError" class="sql-editor-assistant-error" role="alert">{{ assistantError }}</p>
      <div class="sql-editor-field sql-editor-ai-input-field">
        <textarea
          :value="assistantPrompt"
          :placeholder="assistantPlaceholder"
          :disabled="!hasDataSource || isAssistantRunning"
          aria-label="AI instruction"
          aria-describedby="sql-assistant-status"
          rows="3"
          @input="updatePrompt"
          @keydown.enter.exact.prevent="!isAssistantRunning && hasDataSource ? emit('runAssistant') : undefined"
        ></textarea>
      </div>
      <div class="sql-editor-assistant-actions">
        <button type="button" class="sql-editor-ai-send-button" :disabled="!hasDataSource || isAssistantRunning" aria-label="Ask assistant" @click="emit('runAssistant')">
          {{ isAssistantRunning ? 'Asking...' : 'Ask' }}
        </button>
        <button type="button" class="sql-editor-secondary-button" :disabled="!canStopAssistant" aria-label="Stop assistant" @click="emit('stopAssistant')">Stop</button>
        <!-- Quick Actions dropdown button — only when there's a query -->
        <div v-if="hasCurrentQuery" class="sql-editor-quick-actions-menu" :class="{ open: quickActionsOpen }">
          <button
            v-for="item in primaryQuickActions"
            :key="item.action"
            type="button"
            class="sql-editor-secondary-button"
            :disabled="!hasDataSource || isAssistantRunning"
            @click="runQuickAction(item.action)"
          >
            {{ item.label }}
          </button>
          <button
            type="button"
            class="sql-editor-secondary-button sql-editor-quick-actions-toggle"
            :disabled="!hasDataSource || isAssistantRunning"
            :aria-expanded="quickActionsOpen"
            aria-label="More SQL assistant quick actions"
            title="Quick actions for current query"
            @click="quickActionsOpen = !quickActionsOpen"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </button>
          <div v-if="quickActionsOpen" class="sql-editor-quick-actions-dropdown" role="menu">
            <button
              v-for="item in secondaryQuickActions"
              :key="item.action"
              type="button"
              role="menuitem"
              class="sql-editor-quick-actions-item"
              @click="runQuickAction(item.action)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
      </div>
      <p v-if="isAssistantRunning || assistantError" id="sql-assistant-status" class="sql-editor-assistant-status" role="status" aria-label="SQL assistant status" aria-live="polite">{{ assistantStatus }}</p>
    </div>
  </section>
</template>
