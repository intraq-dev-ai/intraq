<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  appendMessage,
  createAnalyzerPlan,
  orchestrateAnalyzer,
  resolveAnalyzerFollowup
} from '../../analyzer/api';
import { sanitizeAnalyzerAnswerText } from '../../analyzer/answer-sanitizer';
import { completeAnalyzerPlan } from '../../analyzer/analyzer-runner';
import { localAnalyzerFailureMessage, persistedOrLocalAnalyzerFailureMessage } from '../../analyzer/failure-message';
import AnalyzerResultBlock from '../../analyzer/AnalyzerResultBlock.vue';
import { readLatestPlanTitle } from '../../analyzer/intent';
import { readError } from '../../analyzer/page-helpers';
import { renderAiMessageMarkdown } from '../../shared/ai-message-markdown';
import DashboardAnalyzerScopeControl from './DashboardAnalyzerScopeControl.vue';
import {
  dashboardAnalyzerComponents,
  dashboardAnalyzerContextSummary,
  dashboardAnalyzerDataSources,
  dashboardAnalyzerPlanContext,
  dashboardAnalyzerPlanModelContext,
  dashboardAnalyzerQuestionPlaceholder,
  dashboardAnalyzerQuickQuestions,
  dashboardAnalyzerScopeMetadata,
  preferredDashboardDataSourceId,
  type DashboardAnalyzerScope
} from './dashboard-analyzer-scope';
import { createDashboardAnalyzerTableDataLoader, fetchDashboardAnalyzerTableData } from './dashboardAnalyzerData';
import { useDashboardAnalyzerConversation } from './use-dashboard-analyzer-conversation';
import type {
  AnalyzerAnswer,
  AnalyzerExecution,
  AnalyzerOrchestration,
  AnalyzerPlan,
  DataSourceSummary
} from '../../analyzer/types';
import type { Dashboard } from '../types';

const props = defineProps<{
  dashboard: Dashboard;
  dataSources: DataSourceSummary[];
  mobile?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();
const selectedDataSourceId = ref('');
const selectedComponentId = ref('');
const questionScope = ref<DashboardAnalyzerScope>('dashboard');
const question = ref('');
const status = ref('Analyzer ready');
const isAsking = ref(false);
const latestAnswer = ref<AnalyzerAnswer | null>(null);
const latestPlan = ref<AnalyzerPlan | null>(null);
const latestExecution = ref<AnalyzerExecution | null>(null);
const latestOrchestration = ref<AnalyzerOrchestration | null>(null);
const activeRequestController = ref<AbortController | null>(null);
const questionInput = ref<HTMLTextAreaElement | null>(null);
const thread = ref<HTMLElement | null>(null);
const IDLE_WORKING_STATUSES = new Set(['Analyzer ready', 'New dashboard analyzer conversation ready']);

const availableDataSources = computed(() => dashboardAnalyzerDataSources(props.dashboard, props.dataSources));
const selectedDataSource = computed(() =>
  availableDataSources.value.find(source => source.id === selectedDataSourceId.value) ?? null
);
const analyzerComponents = computed(() => {
  const sourceIds = new Set(availableDataSources.value.map(source => source.id));
  return dashboardAnalyzerComponents(props.dashboard).filter(component => sourceIds.has(component.dataSourceId));
});
const selectedComponent = computed(() =>
  analyzerComponents.value.find(component => component.id === selectedComponentId.value) ?? null
);
const latestPlanTitle = computed(() => latestPlan.value ? readLatestPlanTitle(latestPlan.value) : 'Analyzer Result');
const suggestedFollowUps = computed(() => latestAnswer.value?.suggestedFollowUps ?? []);
const quickQuestions = computed(() => dashboardAnalyzerQuickQuestions(questionScope.value));
const workingStatus = computed(() => {
  const currentStatus = status.value.trim();
  return currentStatus && !IDLE_WORKING_STATUSES.has(currentStatus) ? currentStatus : 'Working on your question';
});
const {
  conversationError,
  ensureConversation,
  conversation,
  isConversationLoading,
  messages,
  startNewConversation
} = useDashboardAnalyzerConversation({
  dashboard: () => props.dashboard,
  resetAnalyzerState,
  selectedDataSourceId,
  status
});
const isQuestionDisabled = computed(() =>
  isAsking.value || isConversationLoading.value);
const loadMoreDashboardAnalyzerTableData = createDashboardAnalyzerTableDataLoader({
  activeController: () => activeRequestController.value,
  dashboard: () => props.dashboard,
  latestPlan: () => latestPlan.value
});
watch(availableDataSources, sources => {
  if (selectedDataSourceId.value && sources.some(source => source.id === selectedDataSourceId.value)) return;
  selectedDataSourceId.value = preferredDashboardDataSourceId(props.dashboard, sources);
}, { immediate: true });

watch(analyzerComponents, components => {
  if (!components.some(component => component.id === selectedComponentId.value)) {
    selectedComponentId.value = components[0]?.id ?? '';
  }
  if (questionScope.value === 'component' && selectedComponent.value?.dataSourceId) {
    selectedDataSourceId.value = selectedComponent.value.dataSourceId;
  }
}, { immediate: true });

onBeforeUnmount(() => activeRequestController.value?.abort());

watch(
  [() => messages.value.length, () => Boolean(latestExecution.value), isAsking],
  () => void nextTick(() => thread.value?.scrollTo({ top: thread.value.scrollHeight, behavior: 'smooth' }))
);
async function submitQuestion(): Promise<void> {
  const prompt = question.value.trim();
  if (!prompt || isAsking.value) return;
  if (!selectedDataSourceId.value) {
    messages.value = [...messages.value, localAnalyzerFailureMessage('', 'Select a data source before asking Analyzer.')];
    status.value = 'Analyzer needs a data source';
    return;
  }
  if (isConversationLoading.value) {
    status.value = 'Loading Dashboard Analyzer conversation';
    return;
  }
  if (questionScope.value === 'component' && !selectedComponent.value) {
    messages.value = [...messages.value, localAnalyzerFailureMessage('', 'Select a dashboard component before asking Analyzer.')];
    status.value = 'Analyzer needs a component';
    return;
  }
  const controller = new AbortController();
  let conversationId = conversation.value?.id ?? '';
  activeRequestController.value = controller;
  isAsking.value = true;
  try {
    status.value = 'Preparing dashboard conversation';
    conversationId = (await ensureConversation()).id;
    status.value = 'Saving dashboard question';
    const userMessage = await appendMessage(conversationId, {
      role: 'user',
      content: prompt,
      metadata: {
        dashboardId: props.dashboard.id,
        dashboardName: props.dashboard.name,
        dataSourceId: selectedDataSourceId.value,
        ...dashboardAnalyzerScopeMetadata(questionScope.value, selectedComponent.value)
      }
    }, { signal: controller.signal });
    messages.value = [...messages.value, userMessage];
    question.value = '';

    status.value = 'Resolving dashboard context';
    latestOrchestration.value = await orchestrateAnalyzer({
      dataSourceId: selectedDataSourceId.value,
      question: prompt,
      conversationId
    }, { signal: controller.signal });
    const followup = latestOrchestration.value.followup ??
      await resolveAnalyzerFollowup({ question: prompt, conversationId }, { signal: controller.signal });

    status.value = 'Planning analyzer result';
    const questionForPlan = followup.questionForPlan || prompt;
    const dashboardContext = dashboardAnalyzerPlanContext({
      component: selectedComponent.value,
      dataSourceId: selectedDataSourceId.value,
      dashboard: props.dashboard,
      scope: questionScope.value
    });
    latestPlan.value = await createAnalyzerPlan({
      dataSourceId: selectedDataSourceId.value,
      question: questionForPlan,
      conversationId,
      dashboardContext,
      ...dashboardAnalyzerPlanModelContext(questionScope.value, selectedComponent.value)
    }, { signal: controller.signal });
    const completion = await completeAnalyzerPlan({
      conversationId,
      dataSourceId: selectedDataSourceId.value,
      latestPlanTitle: latestPlanTitle.value,
      onStatus: nextStatus => { status.value = nextStatus; },
      orchestration: latestOrchestration.value,
      plan: latestPlan.value,
      prompt,
      signal: controller.signal,
      tableDataLoader: input => fetchDashboardAnalyzerTableData({
        ...input,
        dashboard: props.dashboard
      })
    });
    latestAnswer.value = completion.answer;
    latestExecution.value = completion.execution;
    messages.value = [...messages.value, completion.assistantMessage];
    status.value = completion.needsClarification ? 'Analyzer needs clarification' : 'Analyzer ready';
  } catch (caught) {
    if (controller.signal.aborted || isAbortError(caught)) {
      status.value = 'Analyzer stopped. Ask another question when ready.';
      return;
    }
    const message = readError(caught, 'Analyzer request failed.');
    if (conversationId) {
      messages.value = [
        ...messages.value,
        await persistedOrLocalAnalyzerFailureMessage(
          conversationId,
          message,
          body => appendMessage(conversationId, body, { signal: controller.signal })
        )
      ];
    } else {
      messages.value = [...messages.value, localAnalyzerFailureMessage('', message)];
    }
    status.value = 'Analyzer request failed';
  } finally {
    isAsking.value = false;
    if (activeRequestController.value === controller) activeRequestController.value = null;
  }
}

function stopAnalyzer(): void {
  activeRequestController.value?.abort();
  activeRequestController.value = null;
  isAsking.value = false;
  status.value = 'Stopping analyzer request';
}

function resetAnalyzerState(): void {
  latestAnswer.value = null;
  latestPlan.value = null;
  latestExecution.value = null;
  latestOrchestration.value = null;
}

function resetPanel(): void {
  question.value = '';
  startNewConversation();
}

function applyFollowUp(prompt: string): void {
  question.value = prompt;
  void nextTick(() => questionInput.value?.focus());
}

function selectQuestionContext(scope: DashboardAnalyzerScope, componentId?: string): void {
  const component = scope === 'component'
    ? analyzerComponents.value.find(item => item.id === componentId) ?? null
    : null;
  if (scope === 'component' && !component) return;
  if (scope === questionScope.value && (scope !== 'component' || component?.id === selectedComponentId.value)) return;
  questionScope.value = scope;
  if (component) {
    selectedComponentId.value = component.id;
    selectedDataSourceId.value = component.dataSourceId;
  } else {
    selectedDataSourceId.value = preferredDashboardDataSourceId(props.dashboard, availableDataSources.value);
  }
}

function handleQuestionKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void submitQuestion();
}

function closePanel(): void {
  activeRequestController.value?.abort();
  emit('close');
}

function isAbortError(value: unknown): boolean {
  return value instanceof DOMException && value.name === 'AbortError';
}
</script>

<template>
  <aside
    class="dashboard-analyzer-panel"
    :class="{ 'dashboard-analyzer-panel--mobile': mobile }"
    aria-label="Dashboard AI Analyzer"
    @keydown.esc="closePanel"
  >
    <header class="dashboard-analyzer-header">
      <div>
        <span>Dashboard AI</span>
        <h2>{{ dashboard.name }}</h2>
      </div>
      <button type="button" class="dashboard-analyzer-close" aria-label="Close Dashboard AI Analyzer" @click="closePanel">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </header>

    <div class="dashboard-analyzer-context" aria-label="Dashboard question context">
      <DashboardAnalyzerScopeControl
        :components="analyzerComponents"
        :disabled="isAsking || isConversationLoading"
        :scope="questionScope"
        :selected-component-id="selectedComponentId"
        @select-context="selectQuestionContext"
      />
      <span class="dashboard-analyzer-context-count">
        {{ dashboardAnalyzerContextSummary(questionScope, selectedComponent, analyzerComponents.length, dashboard.filters.length) }}
      </span>
    </div>

    <div ref="thread" class="dashboard-analyzer-thread">
      <section v-if="!messages.length && !isAsking" class="dashboard-analyzer-empty" aria-label="Suggested dashboard questions">
        <h3>Ask about what you see</h3>
        <button v-for="prompt in quickQuestions" :key="prompt" type="button" :disabled="isQuestionDisabled" @click="applyFollowUp(prompt)">
          {{ prompt }}
        </button>
      </section>

      <ol v-if="messages.length || isAsking" class="dashboard-analyzer-messages" aria-label="Dashboard analyzer conversation">
        <li v-for="message in messages" :key="message.id" :data-role="message.role">
          <span>{{ message.role === 'assistant' ? 'AI' : 'You' }}</span>
          <div
            v-if="message.role === 'assistant'"
            class="dashboard-analyzer-answer ai-message-markdown"
            v-html="renderAiMessageMarkdown(sanitizeAnalyzerAnswerText(message.content))"
          ></div>
          <p v-else>{{ message.content }}</p>
        </li>
        <li v-if="isAsking" data-role="assistant" aria-live="polite">
          <span>AI</span>
          <p role="status">{{ workingStatus }}</p>
        </li>
      </ol>

      <AnalyzerResultBlock
        v-if="latestExecution"
        :execution="latestExecution"
        :message-id="conversation?.id ?? 'dashboard-analyzer-result'"
        :plan="latestPlan"
        :table-data-loader="loadMoreDashboardAnalyzerTableData"
      />

      <section v-if="suggestedFollowUps.length" class="dashboard-analyzer-followups" aria-label="Dashboard analyzer follow-ups">
        <h3>Follow-up questions</h3>
        <button v-for="followUp in suggestedFollowUps" :key="followUp" type="button" @click="applyFollowUp(followUp)">
          {{ followUp }}
        </button>
      </section>
    </div>

    <form class="dashboard-analyzer-form" aria-label="Dashboard analyzer form" @submit.prevent="submitQuestion">
      <p
        v-if="isConversationLoading || conversationError"
        id="dashboard-analyzer-conversation-help"
        :role="conversationError ? 'alert' : 'status'"
      >
        {{ conversationError || 'Loading dashboard conversation…' }}
      </p>
      <label class="sr-only" for="dashboard-analyzer-question">Question</label>
      <textarea
        id="dashboard-analyzer-question"
        ref="questionInput"
        v-model="question"
        aria-label="Dashboard analyzer question"
        :aria-describedby="isConversationLoading || conversationError ? 'dashboard-analyzer-conversation-help' : undefined"
        :disabled="isQuestionDisabled"
        rows="2"
        :placeholder="dashboardAnalyzerQuestionPlaceholder(questionScope)"
        @keydown="handleQuestionKeydown"
      ></textarea>
      <div class="dashboard-analyzer-actions">
        <button type="button" class="dashboard-analyzer-new" :disabled="isAsking || isConversationLoading" aria-label="Start new dashboard question" @click="resetPanel">
          New
        </button>
        <button v-if="isAsking" type="button" class="dashboard-analyzer-stop" @click="stopAnalyzer">Stop</button>
        <button type="submit" class="dashboard-analyzer-submit" :disabled="isQuestionDisabled || !selectedDataSource || !question.trim()">
          {{ isAsking ? 'Analyzing' : 'Ask Analyzer' }}
          <svg v-if="!isAsking" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m5 12 14-7-4 14-3-5-7-2Z" />
          </svg>
        </button>
      </div>
    </form>
  </aside>
</template>
