<script setup lang="ts">
import { formatAnalyzerConversationLabel, type AnalyzerSessionSummary } from './conversation-history';
import type { AnalyzerConversation, DataSourceSummary } from './types';

defineProps<{
  conversations: AnalyzerConversation[];
  dataSources: DataSourceSummary[];
  hasLatestExecution: boolean;
  idPrefix?: string;
  isLoading: boolean;
  latestPlanTitle: string;
  selectedConversationId: string;
  selectedDataSourceId: string;
  sessionSummary: AnalyzerSessionSummary;
}>();

const emit = defineEmits<{
  clear: [];
  dashboard: [];
  loadConversations: [];
  new: [];
  selectConversation: [conversationId: string];
  updateDataSource: [dataSourceId: string];
}>();

function selectConversation(event: Event): void {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
  emit('selectConversation', value);
}

function updateDataSource(event: Event): void {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
  emit('updateDataSource', value);
}
</script>

<template>
  <div class="analyzer-config-panel">
    <label class="analyzer-field analyzer-field--compact" :for="`${idPrefix ?? 'analyzer'}-conversation-select`">
      <span>Conversation</span>
      <select
        :id="`${idPrefix ?? 'analyzer'}-conversation-select`"
        aria-label="Analyzer conversation history"
        :value="selectedConversationId"
        :disabled="isLoading"
        @change="selectConversation"
      >
        <option value="">New conversation</option>
        <option v-for="conversation in conversations" :key="conversation.id" :value="conversation.id">
          {{ formatAnalyzerConversationLabel(conversation) }}
        </option>
      </select>
    </label>
    <button class="analyzer-header-button" type="button" @click="emit('new')">New</button>
    <div class="analyzer-session-chip" :data-state="sessionSummary.state" role="status" aria-label="Analyzer session">
      <strong>{{ sessionSummary.label }}</strong>
      <span>{{ sessionSummary.detail }}</span>
    </div>
    <label class="analyzer-field analyzer-field--compact" :for="`${idPrefix ?? 'analyzer'}-data-source`">
      <span>Data Source</span>
      <select :id="`${idPrefix ?? 'analyzer'}-data-source`" :value="selectedDataSourceId" @change="updateDataSource">
        <option v-if="dataSources.length === 0" value="">No data sources</option>
        <option v-for="source in dataSources" :key="source.id" :value="source.id">{{ source.name }}</option>
      </select>
    </label>
    <button class="analyzer-header-button" type="button" :disabled="!selectedConversationId || isLoading" @click="emit('clear')">
      Clear
    </button>
    <button
      class="analyzer-header-button analyzer-header-button--primary"
      type="button"
      :disabled="!latestPlanTitle || !hasLatestExecution"
      aria-label="Open in Dashboard Builder"
      @click="emit('dashboard')"
    >
      Dashboard
    </button>
  </div>
</template>
