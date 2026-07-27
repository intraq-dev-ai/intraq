<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  appendMessage,
  askAnalyzer
} from '../../analyzer/api';
import { sanitizeAnalyzerAnswerText } from '../../analyzer/answer-sanitizer';
import { localAnalyzerFailureMessage, persistedOrLocalAnalyzerFailureMessage } from '../../analyzer/failure-message';
import { readError } from '../../analyzer/page-helpers';
import { renderAiMessageMarkdown } from '../../shared/ai-message-markdown';
import { dashboardDataCachePolicyFromSettings } from '../dashboard-data-cache-policy';
import { loadVisualizationData } from '../visualization/data';
import { visualizationSpecFromElement } from '../visualization/spec';
import DashboardAnalyzerScopeControl from './DashboardAnalyzerScopeControl.vue';
import {
  dashboardAnalyzerComponents,
  dashboardAnalyzerContextSummary,
  dashboardAnalyzerDataSources,
  dashboardAnalyzerQuestionPlaceholder,
  dashboardAnalyzerQuickQuestions,
  dashboardAnalyzerScopeMetadata,
  preferredDashboardDataSourceId,
  type DashboardAnalyzerScope
} from './dashboard-analyzer-scope';
import { useDashboardAnalyzerConversation } from './use-dashboard-analyzer-conversation';
import type {
  AnalyzerAnswer,
  AnalyzerColumn,
  AnalyzerExecution,
  DataSourceSummary
} from '../../analyzer/types';
import type { Dashboard, DashboardElement, VisualizationData } from '../types';

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
const activeRequestController = ref<AbortController | null>(null);
const questionInput = ref<HTMLTextAreaElement | null>(null);
const thread = ref<HTMLElement | null>(null);
const IDLE_WORKING_STATUSES = new Set(['Analyzer ready', 'New dashboard analyzer conversation ready']);
const DASHBOARD_QA_ROW_LIMIT = 5;
const DASHBOARD_QA_ELEMENT_LIMIT = 8;
const DATA_ELEMENT_TYPES = new Set(['area', 'bar', 'card', 'chart', 'column', 'line', 'matrix', 'pie', 'stacked', 'table']);

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
  [() => messages.value.length, isAsking],
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

    status.value = 'Reading visible dashboard data';
    const execution = await dashboardQuestionEvidenceExecution({
      dashboard: props.dashboard,
      dataSourceId: selectedDataSourceId.value,
      scope: questionScope.value,
      selectedComponentId: selectedComponentId.value,
      signal: controller.signal
    });
    if (execution.rowCount === 0) {
      throw new Error('This dashboard does not have enough visible data to answer that question.');
    }

    status.value = 'Answering from this dashboard';
    latestAnswer.value = await askAnalyzer({
      conversationId,
      dataSourceId: selectedDataSourceId.value,
      execution,
      plan: dashboardQuestionAnswerPlan(prompt, execution),
      question: dashboardQuestionPrompt(prompt, props.dashboard.name, questionScope.value)
    }, { signal: controller.signal });

    status.value = 'Saving dashboard answer';
    const assistantMessage = await appendMessage(conversationId, {
      role: 'assistant',
      content: latestAnswer.value.answer,
      metadata: {
        dashboardAnswerOnly: true,
        dashboardId: props.dashboard.id,
        dashboardName: props.dashboard.name,
        evidenceComponentCount: dashboardEvidenceComponentCount(execution),
        suggestedFollowUps: latestAnswer.value.suggestedFollowUps,
        knowledgeReferences: latestAnswer.value.knowledgeReferences
      }
    }, { signal: controller.signal });
    messages.value = [...messages.value, assistantMessage];
    status.value = 'Analyzer ready';
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

async function dashboardQuestionEvidenceExecution(input: {
  dashboard: Dashboard;
  dataSourceId: string;
  scope: DashboardAnalyzerScope;
  selectedComponentId: string;
  signal: AbortSignal;
}): Promise<AnalyzerExecution> {
  const elements = dashboardQuestionEvidenceElements(input);
  const values = await Promise.all(elements.map(element => dashboardQuestionEvidenceRows({
    dashboard: input.dashboard,
    element,
    signal: input.signal
  })));
  const rows = values.flat();
  const columns = analyzerColumnsFromRows(rows);
  return {
    columns,
    dataSourceId: input.dataSourceId,
    fetchedRows: rows.length,
    message: rows.length
      ? 'Dashboard Q&A evidence from visible dashboard components.'
      : 'No dashboard evidence was available.',
    rowCount: rows.length,
    rows,
    tableName: 'dashboard_visible_data',
    title: 'Dashboard evidence',
    totalRows: rows.length
  };
}

function dashboardQuestionEvidenceElements(input: {
  dashboard: Dashboard;
  dataSourceId: string;
  scope: DashboardAnalyzerScope;
  selectedComponentId: string;
}): DashboardElement[] {
  const selectedIds = input.scope === 'component' && input.selectedComponentId
    ? new Set([input.selectedComponentId])
    : null;
  return input.dashboard.elements
    .filter(element =>
      element.isVisible !== false
      && DATA_ELEMENT_TYPES.has(element.type.trim().toLowerCase())
      && (!selectedIds || selectedIds.has(element.id))
      && elementDataSourceId(element) === input.dataSourceId
    )
    .sort((left, right) => elementEvidencePriority(left) - elementEvidencePriority(right) || left.order - right.order)
    .slice(0, DASHBOARD_QA_ELEMENT_LIMIT);
}

async function dashboardQuestionEvidenceRows(input: {
  dashboard: Dashboard;
  element: DashboardElement;
  signal: AbortSignal;
}): Promise<Array<Record<string, boolean | null | number | string>>> {
  try {
    const data = await loadVisualizationData(
      input.element,
      visualizationSpecFromElement(input.element),
      input.dashboard.filters,
      {
        cachePolicy: dashboardDataCachePolicyFromSettings(input.dashboard.settings),
        peerElements: input.dashboard.elements,
        rowLimit: DASHBOARD_QA_ROW_LIMIT,
        signal: input.signal
      }
    );
    return visualizationEvidenceRows(input.element, data);
  } catch (caught) {
    if (isAbortError(caught)) throw caught;
    return [];
  }
}

function visualizationEvidenceRows(
  element: DashboardElement,
  data: VisualizationData
): Array<Record<string, boolean | null | number | string>> {
  const preferred = elementEvidenceFields(element);
  const rawRows = (data.rawData ?? [])
    .slice(0, DASHBOARD_QA_ROW_LIMIT)
    .map(row => ({
      component: element.name,
      componentType: element.type,
      ...scalarFields(row, preferred)
    }))
    .filter(row => Object.keys(row).length > 2);
  if (rawRows.length > 0) return rawRows;

  return data.labels.slice(0, DASHBOARD_QA_ROW_LIMIT).map((label, index) => ({
    component: element.name,
    componentType: element.type,
    label: String(label),
    ...Object.fromEntries(data.datasets.flatMap(dataset => {
      const value = dataset.data[index];
      return typeof value === 'number' && Number.isFinite(value)
        ? [[dataset.label || 'value', value]]
        : [];
    }))
  })).filter(row => Object.keys(row).length > 3);
}

function dashboardQuestionPrompt(question: string, dashboardName: string, scope: DashboardAnalyzerScope): string {
  return [
    `Dashboard: ${dashboardName}.`,
    `Scope: ${scope}.`,
    'Answer the user using only the supplied dashboard_visible_data execution rows.',
    'Do not create tables, SQL, charts, dashboard actions, or queues.',
    'If the dashboard evidence does not contain enough information, say that this dashboard does not show enough data to answer.',
    `User question: ${question}`
  ].join('\n');
}

function dashboardQuestionAnswerPlan(question: string, execution: AnalyzerExecution) {
  return {
    message: 'Answer using only data already visible on this dashboard.',
    actions: [{
      action: 'answer_conversation',
      params: {
        question,
        reason: 'Dashboard Ask AI is limited to plain answers over visible dashboard evidence.'
      }
    }],
    intentDetails: {
      question,
      knowledgeReferences: [],
      selectedModel: null,
      selectedModels: [],
      sql: '',
      insightGuidance: [
        `Use only ${execution.rowCount} dashboard evidence row${execution.rowCount === 1 ? '' : 's'}.`,
        'Do not introduce data that is not already represented by dashboard components.'
      ]
    }
  };
}

function dashboardEvidenceComponentCount(execution: AnalyzerExecution): number {
  const components = new Set((execution.rows ?? []).flatMap(row => readString(row.component) ?? []));
  return components.size;
}

function analyzerColumnsFromRows(rows: Array<Record<string, unknown>>): AnalyzerColumn[] {
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return fields.map(field => ({
    field,
    label: labelFor(field),
    type: rows.some(row => typeof row[field] === 'number') ? 'number' : 'string'
  }));
}

function scalarFields(
  row: Record<string, unknown>,
  preferredFields: string[]
): Record<string, boolean | null | number | string> {
  const fields = preferredFields.length > 0 ? preferredFields : Object.keys(row).slice(0, 12);
  return Object.fromEntries(fields.flatMap(field => {
    const value = row[field];
    if (value === null || typeof value === 'boolean') return [[field, value]];
    if (typeof value === 'number' && Number.isFinite(value)) return [[field, value]];
    if (typeof value === 'string' && value.trim()) return [[field, value.trim().slice(0, 240)]];
    return [];
  }));
}

function elementEvidenceFields(element: DashboardElement): string[] {
  const config = element.config ?? {};
  return unique([
    readString(config.valueField),
    readString(config.field),
    readString(config.xField),
    ...readStringArray(config.ySeries ?? config.yFields),
    ...readStringArray(config.columns),
    ...readStringArray(config.rowFields),
    ...readStringArray(config.columnFields),
    ...readStringArray(config.valueFields)
  ].filter((value): value is string => Boolean(value)));
}

function elementDataSourceId(element: DashboardElement): string | undefined {
  const visualization = readRecord(element.config?.visualization);
  const dataRef = readRecord(visualization?.dataRef);
  return readString(element.dataSourceId)
    ?? readString(element.config?.dataSourceId)
    ?? readString(dataRef?.sourceId);
}

function elementEvidencePriority(element: DashboardElement): number {
  if (element.type === 'card') return 0;
  if (element.type === 'table' || element.type === 'matrix') return 2;
  return 1;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : []) : [];
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function labelFor(field: string): string {
  return field.split('_').map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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
