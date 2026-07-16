<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { appendMessage, clearAnalyzerSession, createAnalyzerPlan, createConversation, fetchConversations, fetchDataSources, fetchMessages, orchestrateAnalyzer, resolveAnalyzerFollowup } from './api';
import AnalyzerComposer from './AnalyzerComposer.vue';
import AnalyzerConversationPanel from './AnalyzerConversationPanel.vue';
import AnalyzerDashboardQueuePanel from './AnalyzerDashboardQueuePanel.vue';
import AnalyzerDashboardSelectorModal from './AnalyzerDashboardSelectorModal.vue';
import AnalyzerHeader from './AnalyzerHeader.vue';
import { buildAnalyzerMentionGroups } from './analyzer-mentions';
import { useAnalyzerDashboardQueue } from './dashboard-queue';
import { completeAnalyzerPlan } from './analyzer-runner';
import { touchAnalyzerConversation } from './conversation-list';
import { summarizeAnalyzerSession } from './conversation-history';
import { preferredAnalyzerDataSourceId, readAnalyzerConversationDataSourceId, resolveAnalyzerConversationDataSourceId, visibleAnalyzerDataSources } from './conversation-selection';
import { localAnalyzerFailureMessage, persistedOrLocalAnalyzerFailureMessage } from './failure-message';
import { collectSampleQuestions, readLatestAnswer, readLatestExecution, readLatestOrchestration, readLatestPlan, readLatestPlanTitle } from './intent';
import { publishAnalyzerSubtitle, readError, readRouteString, titleFromQuestion } from './page-helpers';
import { useAnalyzerDashboardHandoff } from './use-analyzer-dashboard-handoff';
import { useAnalyzerDashboardQueueActions } from './use-analyzer-dashboard-queue-actions';
import { useAnalyzerRoutePrompt } from './use-analyzer-route-prompt';
import type { AnalyzerAnswer, AnalyzerConversation, AnalyzerExecution, AnalyzerMessage, AnalyzerOrchestration, AnalyzerPlan, DataSourceSummary } from './types';
import './analyzer.css';
const route = useRoute();
const router = useRouter();
const dataSources = ref<DataSourceSummary[]>([]);
const conversations = ref<AnalyzerConversation[]>([]);
const messages = ref<AnalyzerMessage[]>([]);
const selectedDataSourceId = ref('');
const selectedConversationId = ref('');
const question = ref('');
const status = ref('Loading analyzer workspace');
const error = ref('');
const latestAnswer = ref<AnalyzerAnswer | null>(null);
const latestPlan = ref<AnalyzerPlan | null>(null);
const latestExecution = ref<AnalyzerExecution | null>(null);
const latestOrchestration = ref<AnalyzerOrchestration | null>(null);
const isLoading = ref(false);
const isAsking = ref(false);
const showMobileConfig = ref(false);
const showQueue = ref(false);
const showExplanations = ref(localStorage.getItem('analyzer.showExplanations') !== 'false');
const activeRequestController = ref<AbortController | null>(null);
const dashboardQueue = useAnalyzerDashboardQueue();
const { count: queueCount, items: dashboardQueueItems } = dashboardQueue;
const selectedDataSource = computed(() => dataSources.value.find(source => source.id === selectedDataSourceId.value) ?? null);
const currentConversation = computed(() => conversations.value.find(item => item.id === selectedConversationId.value) ?? null);
const latestPlanTitle = computed(() => readLatestPlanTitle(latestPlan.value));
const sampleQuestions = computed(() => collectSampleQuestions(selectedDataSource.value));
const suggestedFollowUps = computed(() => latestAnswer.value?.suggestedFollowUps ?? []);
const mentionGroups = computed(() => buildAnalyzerMentionGroups(latestExecution.value));
const hasDashboardHandoff = computed(() => Boolean(latestExecution.value && latestPlanTitle.value));
const sessionSummary = computed(() => summarizeAnalyzerSession(currentConversation.value, messages.value.length));
const composerDisabledReason = computed(() => !selectedDataSourceId.value
  ? 'Select a data source before asking Analyzer.'
  : '');
const { submitRoutePromptIfRequested } = useAnalyzerRoutePrompt({
  canSubmit: computed(() => Boolean(selectedDataSourceId.value)),
  dataSources, isAsking, isLoading, question, route, selectedDataSourceId, submitQuestion
});
const {
  addQueueToExistingDashboard,
  clearDashboardQueue,
  createDashboardFromQueue,
  notifyDashboardQueueCleared,
  queueDashboardResult,
  removeQueuedDashboard,
  sendToDashboardBuilder
} = useAnalyzerDashboardHandoff({
  currentConversation,
  dashboardQueue,
  latestExecution,
  latestPlanTitle,
  router,
  selectedDataSourceId
});
const {
  closeDashboardModal,
  dashboardCatalog,
  dashboardModalMode,
  handleExistingDashboardSelected,
  handleQueuedDashboardCreate,
  isDashboardCatalogLoading,
  isQueueActionRunning,
  openAddToExistingDashboardModal,
  openCreateDashboardModal,
  showDashboardModal
} = useAnalyzerDashboardQueueActions({
  addQueueToExistingDashboard,
  closeQueue,
  createDashboardFromQueue
});
onMounted(async () => {
  window.addEventListener('ai-analyzer-open-config', openMobileConfig);
  isLoading.value = true;
  try {
    await loadDataSources();
    const routeDataSourceId = readRouteString(route.query.dataSourceId);
    if (routeDataSourceId && dataSources.value.some(source => source.id === routeDataSourceId)) {
      selectedDataSourceId.value = routeDataSourceId;
    }
    await loadConversations();
    const routeConversationId = readRouteString(route.params.conversationId);
    if (routeConversationId) await openConversation(routeConversationId, false);
    status.value = 'Analyzer ready';
    publishAnalyzerSubtitle(selectedDataSource.value?.name);
  } finally {
    isLoading.value = false;
  }
  await submitRoutePromptIfRequested();
});
onBeforeUnmount(() => {
  activeRequestController.value?.abort();
  window.removeEventListener('ai-analyzer-open-config', openMobileConfig);
});
watch(selectedDataSource, source => publishAnalyzerSubtitle(source?.name));
watch(() => route.params.conversationId, async () => {
  const routeConversationId = readRouteString(route.params.conversationId);
  if (!routeConversationId) {
    selectedConversationId.value = '';
    resetAnalyzerState();
    return;
  }
  if (routeConversationId !== selectedConversationId.value) await openConversation(routeConversationId, false);
});
async function loadDataSources(): Promise<void> {
  try {
    dataSources.value = visibleAnalyzerDataSources(await fetchDataSources());
    selectedDataSourceId.value = preferredAnalyzerDataSourceId(dataSources.value, selectedDataSourceId.value);
  } catch (caught) {
    error.value = readError(caught, 'Data sources failed to load.');
  }
}
async function loadConversations(dataSourceId = selectedDataSourceId.value): Promise<AnalyzerConversation[]> {
  try {
    conversations.value = await fetchConversations(dataSourceId);
    return conversations.value;
  } catch (caught) {
    error.value = readError(caught, 'Analyzer conversations failed to load.');
    return [];
  }
}
async function openConversation(conversationId: string, updateRoute = true): Promise<void> {
  selectedConversationId.value = conversationId;
  isLoading.value = true;
  error.value = '';
  status.value = 'Loading conversation';
  try {
    const dataSourceId = await resolveAnalyzerConversationDataSourceId(
      conversationId,
      conversations.value,
      () => fetchConversations()
    );
    if (dataSourceId && dataSourceId !== selectedDataSourceId.value) {
      selectedDataSourceId.value = dataSourceId;
      await loadConversations(dataSourceId);
    }
    messages.value = await fetchMessages(conversationId);
    const conversation = conversations.value.find(item => item.id === conversationId);
    const conversationDataSourceId = readAnalyzerConversationDataSourceId(conversation);
    if (conversationDataSourceId) selectedDataSourceId.value = conversationDataSourceId;
    latestAnswer.value = readLatestAnswer(messages.value);
    latestPlan.value = readLatestPlan(messages.value);
    latestExecution.value = readLatestExecution(messages.value);
    latestOrchestration.value = readLatestOrchestration(messages.value);
    status.value = 'Analyzer ready';
    if (updateRoute) await router.push(`/ai-analyzer/${conversationId}`);
  } catch (caught) {
    error.value = readError(caught, 'Conversation failed to load.');
    status.value = 'Conversation failed to load';
  } finally {
    isLoading.value = false;
  }
}
async function startNewConversation(): Promise<void> {
  selectedConversationId.value = '';
  resetAnalyzerState();
  error.value = '';
  status.value = 'New conversation ready';
  await router.push('/ai-analyzer');
}
async function handleNewConversation(): Promise<void> {
  if (isAsking.value) {
    status.value = 'Stop analyzer before switching conversations';
    return;
  }
  await createSavedConversation();
  closeMobileConfig();
}
async function submitQuestion(): Promise<void> {
  const prompt = question.value.trim();
  if (!prompt || isAsking.value) return;
  if (!selectedDataSourceId.value) {
    messages.value = [...messages.value, localAnalyzerFailureMessage('', 'Select a data source before asking Analyzer.')];
    error.value = '';
    status.value = 'Analyzer needs a data source';
    return;
  }
  const controller = new AbortController();
  let conversationId = selectedConversationId.value;
  activeRequestController.value = controller;
  isAsking.value = true;
  error.value = '';
  status.value = 'Saving question to conversation';
  try {
    conversationId = await ensureConversation(prompt, controller.signal);
    const userMessage = await appendMessage(conversationId, {
      role: 'user',
      content: prompt,
      metadata: { dataSourceId: selectedDataSourceId.value }
    }, { signal: controller.signal });
    messages.value = [...messages.value, userMessage];
    conversations.value = touchAnalyzerConversation(conversations.value, conversationId, {
      lastMessageAt: userMessage.createdAt,
      updatedAt: userMessage.createdAt
    });
    question.value = '';
    status.value = 'Resolving conversation context';
    latestOrchestration.value = await orchestrateAnalyzer({
      dataSourceId: selectedDataSourceId.value,
      question: prompt,
      conversationId
    }, { signal: controller.signal });
    const followup = latestOrchestration.value.followup ??
      await resolveAnalyzerFollowup({ question: prompt, conversationId }, { signal: controller.signal });
    const questionForPlan = followup.questionForPlan
      || latestOrchestration.value?.coveredQuestions[0]
      || prompt;
    status.value = 'Planning analyzer result';
    latestPlan.value = await createAnalyzerPlan({
      dataSourceId: selectedDataSourceId.value,
      question: questionForPlan,
      conversationId
    }, { signal: controller.signal });
    const completion = await completeAnalyzerPlan({
      conversationId,
      dataSourceId: selectedDataSourceId.value,
      latestPlanTitle: latestPlanTitle.value,
      onStatus: nextStatus => { status.value = nextStatus; },
      orchestration: latestOrchestration.value,
      plan: latestPlan.value,
      prompt,
      signal: controller.signal
    });
    latestAnswer.value = completion.answer;
    latestExecution.value = completion.execution;
    messages.value = [...messages.value, completion.assistantMessage];
    conversations.value = touchAnalyzerConversation(conversations.value, conversationId, {
      lastMessageAt: completion.assistantMessage.createdAt,
      updatedAt: completion.assistantMessage.createdAt
    });
    status.value = completion.needsClarification ? 'Analyzer needs clarification' : 'Analyzer ready';
  } catch (caught) {
    if (controller.signal.aborted || isAbortError(caught)) {
      error.value = '';
      status.value = 'Analyzer stopped. Ask another question when ready.';
      return;
    }
    const message = readError(caught, 'Analyzer request failed.');
    if (conversationId) {
      const failureMessage = await persistedOrLocalAnalyzerFailureMessage(
        conversationId,
        message,
        body => appendMessage(conversationId, body, { signal: controller.signal })
      );
      messages.value = [
        ...messages.value,
        failureMessage
      ];
      conversations.value = touchAnalyzerConversation(conversations.value, conversationId, {
        lastMessageAt: failureMessage.createdAt,
        updatedAt: failureMessage.createdAt
      });
    } else {
      messages.value = [...messages.value, localAnalyzerFailureMessage('', message)];
    }
    error.value = '';
    status.value = 'Analyzer request failed';
  } finally {
    isAsking.value = false;
    if (activeRequestController.value === controller) activeRequestController.value = null;
  }
}
async function ensureConversation(prompt: string, signal?: AbortSignal): Promise<string> {
  if (selectedConversationId.value) return selectedConversationId.value;
  const conversation = await createConversation({
    title: titleFromQuestion(prompt),
    dataSourceId: selectedDataSourceId.value
  }, { signal });
  selectedConversationId.value = conversation.id;
  conversations.value = [conversation, ...conversations.value];
  await router.replace(`/ai-analyzer/${conversation.id}`);
  return conversation.id;
}
async function createSavedConversation(): Promise<void> {
  if (!selectedDataSourceId.value) {
    await startNewConversation();
    status.value = 'Select a data source before saving a conversation';
    return;
  }
  isLoading.value = true;
  error.value = '';
  try {
    const conversation = await createConversation({
      title: 'New conversation',
      dataSourceId: selectedDataSourceId.value
    });
    selectedConversationId.value = conversation.id;
    conversations.value = [conversation, ...conversations.value];
    resetAnalyzerState();
    status.value = 'Saved conversation ready';
    await router.push(`/ai-analyzer/${conversation.id}`);
  } catch (caught) {
    error.value = readError(caught, 'Conversation could not be created.');
    status.value = 'Conversation could not be created';
  } finally {
    isLoading.value = false;
  }
}
async function clearSession(): Promise<void> {
  if (!selectedConversationId.value) return;
  try {
    const codexSession = await clearAnalyzerSession(selectedConversationId.value);
    conversations.value = conversations.value.map(conversation =>
      conversation.id === selectedConversationId.value
        ? { ...conversation, metadata: { ...(conversation.metadata ?? {}), codexSession } }
        : conversation
    );
    status.value = 'Analyzer session cleared';
  } catch (caught) {
    error.value = readError(caught, 'Session clear failed.');
  }
}
async function handleConversationChange(conversationId: string): Promise<void> {
  if (isAsking.value) {
    status.value = 'Stop analyzer before switching conversations';
    return;
  }
  if (!conversationId) {
    await startNewConversation();
    return;
  }
  await openConversation(conversationId);
  closeMobileConfig();
}
async function handleDataSourceUpdate(dataSourceId: string): Promise<void> {
  if (isAsking.value) {
    status.value = 'Stop analyzer before switching data sources';
    return;
  }
  const nextDataSourceId = dataSourceId.trim();
  if (!nextDataSourceId || nextDataSourceId === selectedDataSourceId.value) return;
  selectedDataSourceId.value = nextDataSourceId;
  selectedConversationId.value = '';
  resetAnalyzerState();
  error.value = '';
  status.value = 'Loading analyzer conversations';
  await loadConversations(nextDataSourceId);
  if (!error.value) status.value = 'Select a conversation or ask a new question';
  await router.replace('/ai-analyzer');
  closeMobileConfig();
}
function openMobileConfig(): void { showMobileConfig.value = true; }
function closeMobileConfig(): void { showMobileConfig.value = false; }
async function submitSuggestedQuestion(sample: string): Promise<void> {
  const nextQuestion = sample.trim();
  if (!nextQuestion || isLoading.value || isAsking.value) return;
  question.value = nextQuestion;
  await submitQuestion();
}
function toggleQueue(): void { showQueue.value = !showQueue.value; }
function closeQueue(): void { showQueue.value = false; }
function handleClearDashboardQueue(): void {
  clearDashboardQueue();
  notifyDashboardQueueCleared();
}
function toggleExplanations(): void {
  showExplanations.value = !showExplanations.value;
  localStorage.setItem('analyzer.showExplanations', String(showExplanations.value));
}
function stopAnalyzer(): void {
  if (!isAsking.value) return;
  status.value = 'Stopping analyzer request';
  activeRequestController.value?.abort();
}
function resetAnalyzerState(): void {
  messages.value = [];
  latestAnswer.value = null;
  latestPlan.value = null;
  latestExecution.value = null;
  latestOrchestration.value = null;
}
function isAbortError(caught: unknown): boolean {
  return caught instanceof Error && caught.name === 'AbortError';
}
</script>
<template>
  <section class="ai-analyzer-page" aria-labelledby="analyzer-title">
    <h2 class="analyzer-sr-only">AI Analyzer</h2>
    <div class="ai-analyzer-body">
      <div class="ai-data-analyzer ai-data-analyzer--full">
        <AnalyzerHeader
          :conversations="conversations"
          :data-sources="dataSources"
          :has-latest-execution="hasDashboardHandoff"
          :is-loading="isLoading"
          :latest-plan-title="latestPlanTitle"
          :queue-count="queueCount"
          :selected-conversation-id="selectedConversationId"
          :selected-data-source-id="selectedDataSourceId"
          :selected-data-source-name="selectedDataSource?.name ?? ''"
          :session-summary="sessionSummary"
          :show-explanations="showExplanations"
          :show-mobile-config="showMobileConfig"
          :show-queue="showQueue"
          @clear="clearSession"
          @close-mobile-config="closeMobileConfig"
          @dashboard="sendToDashboardBuilder"
          @load-conversations="loadConversations"
          @new="handleNewConversation"
          @select-conversation="handleConversationChange"
          @toggle-explanations="toggleExplanations"
          @toggle-queue="toggleQueue"
          @update-data-source="handleDataSourceUpdate"
        />
        <AnalyzerDashboardQueuePanel
          v-if="showQueue"
          :items="dashboardQueueItems"
          @add-existing="openAddToExistingDashboardModal"
          @clear="handleClearDashboardQueue"
          @close="closeQueue"
          @create-dashboard="openCreateDashboardModal"
          @remove="removeQueuedDashboard"
        />
        <AnalyzerDashboardSelectorModal
          :dashboards="dashboardCatalog"
          :initial-mode="dashboardModalMode"
          :item-count="queueCount"
          :loading="isDashboardCatalogLoading"
          :processing="isQueueActionRunning"
          :show="showDashboardModal"
          @close="closeDashboardModal"
          @create="handleQueuedDashboardCreate"
          @select="handleExistingDashboardSelected"
        />
        <AnalyzerConversationPanel
          :messages="messages"
          :is-asking="isAsking"
          :is-loading="isLoading"
          :is-question-disabled="false"
          :error="error"
          :orchestration="latestOrchestration"
          :sample-questions="sampleQuestions"
          :selected-data-source-name="selectedDataSource?.name ?? ''"
          :show-explanations="showExplanations"
          :status="status"
          :suggested-follow-ups="suggestedFollowUps"
          @dashboard="sendToDashboardBuilder"
          @queue="queueDashboardResult"
          @use-sample="submitSuggestedQuestion"
        />
        <AnalyzerComposer
          :disabled-reason="composerDisabledReason"
          :is-asking="isAsking"
          :is-submit-disabled="isLoading || !selectedDataSourceId"
          :mention-groups="mentionGroups"
          :question="question"
          @stop="stopAnalyzer"
          @submit="submitQuestion"
          @update-question="question = $event"
        />
      </div>
    </div>
  </section>
</template>
