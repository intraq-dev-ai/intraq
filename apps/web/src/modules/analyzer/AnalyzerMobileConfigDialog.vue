<script setup lang="ts">
import AnalyzerConfigPanel from './AnalyzerConfigPanel.vue';
import type { AnalyzerSessionSummary } from './conversation-history';
import type { AnalyzerConversation, DataSourceSummary } from './types';

defineProps<{
  conversations: AnalyzerConversation[];
  dataSources: DataSourceSummary[];
  hasLatestExecution: boolean;
  isLoading: boolean;
  latestPlanTitle: string;
  selectedConversationId: string;
  selectedDataSourceId: string;
  sessionSummary: AnalyzerSessionSummary;
}>();

const emit = defineEmits<{
  clear: [];
  close: [];
  dashboard: [];
  loadConversations: [];
  new: [];
  selectConversation: [conversationId: string];
  updateDataSource: [dataSourceId: string];
}>();
</script>

<template>
  <div class="mobile-config-overlay" @click.self="emit('close')">
    <section class="mobile-config-dialog" aria-label="Analyzer settings">
      <div class="mobile-config-header">
        <h2>Analyzer Settings</h2>
        <button class="mobile-config-close" type="button" aria-label="Close settings" @click="emit('close')">x</button>
      </div>
      <AnalyzerConfigPanel
        :conversations="conversations"
        :data-sources="dataSources"
        :has-latest-execution="hasLatestExecution"
        id-prefix="analyzer-mobile"
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
    </section>
  </div>
</template>
