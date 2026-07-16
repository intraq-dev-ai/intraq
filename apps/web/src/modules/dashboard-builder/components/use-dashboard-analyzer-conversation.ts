import { computed, ref, watch, type Ref } from 'vue';
import {
  createConversation,
  fetchConversations,
  fetchMessages
} from '../../analyzer/api';
import type { AnalyzerConversation, AnalyzerMessage } from '../../analyzer/types';
import {
  dashboardAnalyzerConversationInput,
  selectDashboardAnalyzerConversation
} from './dashboard-analyzer-conversation';

interface DashboardAnalyzerConversationOptions {
  dashboard: () => { id: string; name: string };
  resetAnalyzerState: () => void;
  selectedDataSourceId: Ref<string>;
  status: Ref<string>;
}

export function useDashboardAnalyzerConversation(
  options: DashboardAnalyzerConversationOptions
) {
  const conversation = ref<AnalyzerConversation | null>(null);
  const messages = ref<AnalyzerMessage[]>([]);
  const isConversationLoading = ref(false);
  const conversationError = ref('');
  const currentConversation = computed(() => conversation.value);
  let loadRequestId = 0;

  watch(
    [options.selectedDataSourceId, () => options.dashboard().id],
    () => { void loadConversation(); },
    { immediate: true }
  );

  async function loadConversation(): Promise<void> {
    const requestId = ++loadRequestId;
    const dataSourceId = options.selectedDataSourceId.value;
    const dashboardId = options.dashboard().id;
    conversation.value = null;
    messages.value = [];
    options.resetAnalyzerState();
    conversationError.value = '';
    if (!dataSourceId || !dashboardId) return;
    isConversationLoading.value = true;
    options.status.value = 'Loading Dashboard Analyzer conversation';
    try {
      const conversations = await fetchConversations(dataSourceId);
      const active = selectDashboardAnalyzerConversation(conversations, dashboardId, dataSourceId);
      if (requestId !== loadRequestId) return;
      conversation.value = active;
      messages.value = active ? await loadMessages(active.id, requestId) : [];
      if (requestId !== loadRequestId) return;
      options.status.value = active
        ? 'Dashboard Analyzer conversation restored'
        : 'New dashboard analyzer conversation ready';
    } catch (caught) {
      if (requestId !== loadRequestId) return;
      conversation.value = null;
      messages.value = [];
      conversationError.value = caught instanceof Error
        ? caught.message
        : 'Dashboard Analyzer conversation could not be loaded.';
      options.status.value = 'Dashboard Analyzer conversation load failed';
    } finally {
      if (requestId === loadRequestId) isConversationLoading.value = false;
    }
  }

  async function ensureConversation(): Promise<AnalyzerConversation> {
    const dataSourceId = options.selectedDataSourceId.value;
    const dashboard = options.dashboard();
    if (!dataSourceId) throw new Error('Select a data source before asking Analyzer.');
    if (currentConversation.value?.dataSourceId === dataSourceId
      && currentConversation.value.metadata?.dashboardId === dashboard.id) {
      return currentConversation.value;
    }
    const created = await createConversation(dashboardAnalyzerConversationInput({
      dashboardId: dashboard.id,
      dashboardName: dashboard.name,
      dataSourceId
    }));
    conversation.value = created;
    messages.value = [];
    conversationError.value = '';
    return created;
  }

  function startNewConversation(): void {
    loadRequestId += 1;
    isConversationLoading.value = false;
    conversationError.value = '';
    conversation.value = null;
    messages.value = [];
    options.resetAnalyzerState();
    options.status.value = 'New dashboard analyzer conversation ready';
  }

  async function loadMessages(conversationId: string, requestId: number): Promise<AnalyzerMessage[]> {
    try {
      return await fetchMessages(conversationId);
    } catch {
      if (requestId === loadRequestId) {
        conversationError.value = 'Saved dashboard conversation was restored, but earlier messages could not be loaded.';
      }
      return [];
    }
  }

  return {
    conversation,
    conversationError,
    ensureConversation,
    isConversationLoading,
    messages,
    startNewConversation
  };
}
