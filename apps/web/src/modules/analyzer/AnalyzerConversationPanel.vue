<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { renderAiMessageMarkdown } from '../shared/ai-message-markdown';
import { sanitizeAnalyzerAnswerText } from './answer-sanitizer';
import AnalyzerResultBlock from './AnalyzerResultBlock.vue';
import {
  readMessageExecutions,
  readMessagePlan
} from './intent';
import type { AnalyzerVisualizationType } from './result-data';
import type { AnalyzerExecution, AnalyzerMessage, AnalyzerOrchestration } from './types';

const props = defineProps<{
  error: string;
  isAsking: boolean;
  isLoading: boolean;
  isQuestionDisabled?: boolean;
  messages: AnalyzerMessage[];
  orchestration: AnalyzerOrchestration | null;
  sampleQuestions: string[];
  selectedDataSourceName: string;
  showExplanations: boolean;
  status: string;
  suggestedFollowUps: string[];
}>();

const emit = defineEmits<{
  dashboard: [execution: AnalyzerExecution];
  queue: [payload: { execution: AnalyzerExecution; type: AnalyzerVisualizationType }];
  useSample: [sample: string];
}>();

const chatContainer = ref<HTMLElement | null>(null);
const messageList = ref<HTMLElement | null>(null);
const messageExecutions = computed(() => new Map(
  props.messages.map(message => [message.id, readMessageExecutions(message)])
));
const messagePlans = computed(() => new Map(
  props.messages.map(message => [message.id, readMessagePlan(message)])
));
const latestMessageKey = computed(() => `${props.messages.at(-1)?.id ?? 'empty'}:${props.isAsking}`);
const answeredQuestions = computed(() => props.orchestration?.coveredQuestions ?? []);
const deferredQuestions = computed(() => props.orchestration?.deferredQuestions ?? []);
const showDeferredQuestions = computed(() => deferredQuestions.value.length > 0 || answeredQuestions.value.length > 1);
const workingStatus = computed(() => {
  if (!props.isAsking) return '';
  const status = props.status.trim();
  return status && !IDLE_WORKING_STATUSES.has(status) ? status : 'Working on your question';
});
const IDLE_WORKING_STATUSES = new Set([
  'Analyzer ready',
  'Conversation loaded',
  'New conversation ready',
  'Saved conversation ready'
]);
let keepLatestMessagePinned = true;
let resizeObserver: ResizeObserver | null = null;
let scrollFrame = 0;

watch(latestMessageKey, () => {
  void pinConversationBottom();
}, { flush: 'post', immediate: true });

watch(messageList, () => {
  connectResizeObserver();
}, { flush: 'post' });

onMounted(() => {
  connectResizeObserver();
  window.addEventListener('scroll', handlePageScroll, { passive: true });
  scrollToBottom();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('scroll', handlePageScroll);
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
});

function connectResizeObserver(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!messageList.value || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => {
    if (keepLatestMessagePinned) scrollToBottom();
  });
  resizeObserver.observe(messageList.value);
}

async function pinConversationBottom(): Promise<void> {
  keepLatestMessagePinned = true;
  await nextTick();
  scrollToBottom();
}

function scrollToBottom(): void {
  const container = chatContainer.value;
  if (!container) return;
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const currentContainer = chatContainer.value;
    if (!currentContainer) return;
    const scrollTarget = scrollTargetFor(currentContainer);
    scrollTarget.scrollTop = scrollTarget.scrollHeight;
  });
}

function handleChatScroll(): void {
  const container = chatContainer.value;
  if (!container) return;
  const scrollTarget = scrollTargetFor(container);
  keepLatestMessagePinned = scrollTarget.scrollHeight - scrollTarget.clientHeight - scrollTarget.scrollTop <= 24;
}

function handlePageScroll(): void {
  handleChatScroll();
}

function handleResultViewChange(): void {
  void pinConversationBottom();
}

function resultFor(message: AnalyzerMessage): AnalyzerExecution[] {
  return messageExecutions.value.get(message.id) ?? [];
}

function planFor(message: AnalyzerMessage) {
  return messagePlans.value.get(message.id) ?? null;
}

function answerContent(message: AnalyzerMessage): string {
  return sanitizeAnalyzerAnswerText(message.content);
}

function hasExecution(message: AnalyzerMessage): boolean {
  return (messageExecutions.value.get(message.id) ?? []).length > 0;
}

function scrollTargetFor(container: HTMLElement): HTMLElement {
  const workspace = container.closest<HTMLElement>('.home-main');
  if (workspace && getComputedStyle(workspace).overflowY !== 'visible' && workspace.scrollHeight > workspace.clientHeight) {
    return workspace;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

</script>

<template>
  <main ref="chatContainer" class="ai-analyzer-chat" aria-labelledby="messages-title" @scroll.passive="handleChatScroll">
    <h2 id="messages-title" class="analyzer-sr-only">Analyzer conversation</h2>
    <div v-if="isLoading && messages.length === 0" class="settings-placeholder" role="status" aria-live="polite">
      <div class="placeholder-icon" aria-hidden="true">AI</div>
      <h3>Loading conversation</h3>
      <p>Restoring the saved analyzer thread and its agent context.</p>
    </div>

    <div v-else-if="error && messages.length === 0" class="settings-placeholder settings-placeholder--error" role="alert">
      <div class="placeholder-icon" aria-hidden="true">!</div>
      <h3>Analyzer could not load</h3>
      <p>{{ error }}</p>
    </div>

    <div v-else-if="messages.length === 0" class="ai-analyzer-welcome">
      <div class="ai-analyzer-welcome-icon" aria-hidden="true">AI</div>
      <h3>{{ selectedDataSourceName ? `Ready to analyze ${selectedDataSourceName}` : 'Select a data source to start' }}</h3>
      <p>Ask a question and I will highlight what matters.</p>
      <div v-if="sampleQuestions.length" class="ai-analyzer-suggestions" aria-label="Analyzer suggestions">
        <button
          v-for="sample in sampleQuestions"
          :key="sample"
          class="analyzer-chip"
          type="button"
          :disabled="isAsking || isLoading || isQuestionDisabled"
          @click="emit('useSample', sample)"
        >
          {{ sample }}
        </button>
      </div>
    </div>

    <ol v-else ref="messageList" class="analyzer-message-list" aria-label="Analyzer conversation">
      <li v-for="message in messages" :key="message.id" class="analyzer-message-row" :data-role="message.role">
        <div
          v-if="message.role === 'assistant'"
          class="analyzer-avatar analyzer-avatar--assistant"
          aria-hidden="true"
        >AI</div>
        <div
          v-else
          class="analyzer-avatar analyzer-avatar--user"
          aria-hidden="true"
        >You</div>
        <article class="analyzer-message" :data-role="message.role">
          <strong>{{ message.role === 'user' ? 'You' : 'AI Analyzer' }}</strong>
          <p v-if="message.role === 'user'">{{ message.content }}</p>
          <AnalyzerResultBlock
            v-for="(execution, executionIndex) in message.role === 'assistant' ? resultFor(message) : []"
            :key="`${message.id}-result-${execution.tableName}-${executionIndex}`"
            :execution="execution"
            :message-id="message.id"
            :plan="planFor(message)"
            @dashboard="emit('dashboard', $event)"
            @queue="emit('queue', $event)"
            @view-change="handleResultViewChange"
          />
          <div
            v-if="message.role === 'assistant' && (!hasExecution(message) || showExplanations)"
            class="ai-message-markdown"
            aria-label="Analyzer answer"
            v-html="renderAiMessageMarkdown(answerContent(message))"
          ></div>
          <p
            v-else-if="message.role === 'assistant' && hasExecution(message) && !showExplanations"
            class="analyzer-explanation-muted"
          >
            Explanation hidden. Turn on Explanations to view the written summary.
          </p>
        </article>
      </li>
      <li v-if="isAsking" class="analyzer-message-row" data-role="assistant">
        <div class="analyzer-avatar analyzer-avatar--assistant" aria-hidden="true">AI</div>
        <article class="analyzer-message" data-role="assistant" aria-live="polite">
          <strong>AI Analyzer</strong>
          <div class="analyzer-progress-line" role="status" aria-label="Analyzer progress">
            <span class="typing-indicator" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span>{{ workingStatus }}</span>
          </div>
        </article>
      </li>
      <li v-if="!isAsking && suggestedFollowUps.length" class="analyzer-message-row" data-role="assistant">
        <div class="analyzer-avatar analyzer-avatar--assistant" aria-hidden="true">AI</div>
        <article class="analyzer-message analyzer-followups-card" data-role="assistant">
          <strong>Suggested follow-up questions</strong>
          <ul aria-label="Suggested follow-up questions">
            <li v-for="followUp in suggestedFollowUps" :key="followUp">
                <button type="button" :disabled="isAsking || isLoading || isQuestionDisabled" @click="emit('useSample', followUp)">{{ followUp }}</button>
            </li>
          </ul>
        </article>
      </li>
      <li v-if="!isAsking && showDeferredQuestions" class="analyzer-message-row" data-role="assistant">
        <div class="analyzer-avatar analyzer-avatar--assistant" aria-hidden="true">AI</div>
        <article class="analyzer-message analyzer-followups-card analyzer-deferred-card" data-role="assistant">
          <strong>Question breakdown</strong>
          <div v-if="answeredQuestions.length" class="analyzer-deferred-section">
            <h4>Answered In This Attempt</h4>
            <ul aria-label="Answered in this attempt">
              <li v-for="question in answeredQuestions" :key="`answered:${question}`">
                <span>{{ question }}</span>
              </li>
            </ul>
          </div>
          <div v-if="deferredQuestions.length" class="analyzer-deferred-section">
            <h4>Available Next</h4>
            <ul aria-label="Available next">
              <li v-for="question in deferredQuestions" :key="`deferred:${question}`">
                <button type="button" :disabled="isAsking || isLoading || isQuestionDisabled" @click="emit('useSample', question)">{{ question }}</button>
              </li>
            </ul>
          </div>
        </article>
      </li>
    </ol>
  </main>
</template>
