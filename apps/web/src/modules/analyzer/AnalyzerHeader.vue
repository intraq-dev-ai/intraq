<script setup lang="ts">
import AnalyzerConfigPanel from './AnalyzerConfigPanel.vue';
import AnalyzerMobileConfigDialog from './AnalyzerMobileConfigDialog.vue';
import type { AnalyzerSessionSummary } from './conversation-history';
import type { AnalyzerConversation, DataSourceSummary } from './types';

defineProps<{
  conversations: AnalyzerConversation[];
  dataSources: DataSourceSummary[];
  hasLatestExecution: boolean;
  isLoading: boolean;
  latestPlanTitle: string;
  queueCount: number;
  selectedConversationId: string;
  selectedDataSourceId: string;
  selectedDataSourceName: string;
  sessionSummary: AnalyzerSessionSummary;
  showExplanations: boolean;
  showMobileConfig: boolean;
  showQueue: boolean;
}>();

const emit = defineEmits<{
  clear: [];
  closeMobileConfig: [];
  dashboard: [];
  loadConversations: [];
  new: [];
  selectConversation: [conversationId: string];
  toggleExplanations: [];
  toggleQueue: [];
  updateDataSource: [dataSourceId: string];
}>();
</script>

<template>
  <header class="ai-analyzer-header">
    <div class="ai-analyzer-title-group">
      <div class="ai-analyzer-icon" aria-hidden="true">AI</div>
      <div>
        <h1 id="analyzer-title">AI Data Analyzer</h1>
        <p>{{ selectedDataSourceName ? `Querying ${selectedDataSourceName}` : 'Ask a question to get insights' }}</p>
      </div>
    </div>
    <div class="ai-analyzer-header-actions">
      <AnalyzerConfigPanel
        :conversations="conversations"
        :data-sources="dataSources"
        :has-latest-execution="hasLatestExecution"
        id-prefix="analyzer"
        :is-loading="isLoading"
        :latest-plan-title="latestPlanTitle"
        :selected-conversation-id="selectedConversationId"
        :selected-data-source-id="selectedDataSourceId"
        :session-summary="sessionSummary"
        @clear="emit('clear')"
        @dashboard="emit('dashboard')"
        @load-conversations="emit('loadConversations')"
        @new="emit('new')"
        @select-conversation="emit('selectConversation', $event)"
        @update-data-source="emit('updateDataSource', $event)"
      />
    </div>

    <!-- Queue + Explanations always visible on right -->
    <div class="ai-analyzer-header-tools">
      <button
        type="button"
        class="analyzer-header-button analyzer-header-button--queue"
        aria-controls="analyzer-dashboard-queue-panel"
        :aria-expanded="showQueue"
        title="Dashboard queue"
        @click="emit('toggleQueue')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
        </svg>
        Queue
        <span v-if="queueCount > 0" class="analyzer-queue-badge">{{ queueCount }}</span>
      </button>
      <button
        type="button"
        class="analyzer-header-button"
        :aria-pressed="showExplanations"
        :title="showExplanations ? 'Hide explanations' : 'Show explanations'"
        @click="emit('toggleExplanations')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>
        Explanations
      </button>
    </div>
  </header>
  <AnalyzerMobileConfigDialog
    v-if="showMobileConfig"
    :conversations="conversations"
    :data-sources="dataSources"
    :has-latest-execution="hasLatestExecution"
    :is-loading="isLoading"
    :latest-plan-title="latestPlanTitle"
    :selected-conversation-id="selectedConversationId"
    :selected-data-source-id="selectedDataSourceId"
    :session-summary="sessionSummary"
    @clear="emit('clear')"
    @close="emit('closeMobileConfig')"
    @dashboard="emit('dashboard')"
    @load-conversations="emit('loadConversations')"
    @new="emit('new')"
    @select-conversation="emit('selectConversation', $event)"
    @update-data-source="emit('updateDataSource', $event)"
  />
</template>
