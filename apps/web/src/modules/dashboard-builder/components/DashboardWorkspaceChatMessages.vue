<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, ref, watch } from 'vue';
import { dashboardAgentMessagesForSelection } from '../workspace/dashboard-agent-conversation-state';
import type { DashboardAgentMessage, DashboardElement } from '../types';

const props = defineProps<{
  agentMessages: DashboardAgentMessage[];
  selectedElement: DashboardElement | null;
}>();

const emit = defineEmits<{
  messageAction: [actionId: string, messageId: string];
}>();

const chatMessages = ref<HTMLElement | null>(null);
const chatEnd = ref<HTMLElement | null>(null);
const visibleAgentMessages = computed(() => dashboardAgentMessagesForSelection(props.agentMessages, props.selectedElement));
const messageScrollKey = computed(() => visibleAgentMessages.value.map(message => [
  message.id,
  message.role,
  message.kind,
  message.title ?? '',
  message.body,
  message.details?.join('|') ?? '',
  message.actions?.map(action => `${action.id}:${action.label}`).join('|') ?? ''
].join(':')).join('\n'));

function messageAriaLabel(message: DashboardAgentMessage): string {
  if (message.role !== 'assistant') return 'User message';
  return message.kind === 'model_context' ? 'Dashboard AI model context' : `Dashboard AI ${message.kind}`;
}

async function scrollChatToLatest(): Promise<void> {
  await nextTick();
  scrollChatToBottom();
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      scrollChatToBottom();
      window.requestAnimationFrame(scrollChatToBottom);
    });
  }
}

function scrollChatToBottom(): void {
  const container = chatMessages.value;
  if (!container) return;
  const anchor = chatEnd.value;
  container.scrollTop = anchor ? anchor.offsetTop + anchor.offsetHeight : container.scrollHeight;
}

watch(messageScrollKey, () => {
  void scrollChatToLatest();
}, { flush: 'post' });

watch(() => [props.selectedElement?.id ?? '', props.selectedElement?.name ?? ''], () => {
  void scrollChatToLatest();
}, { flush: 'post' });

onMounted(() => {
  void scrollChatToLatest();
});

onUpdated(() => {
  void scrollChatToLatest();
});
</script>

<template>
  <div ref="chatMessages" class="ai-chat-messages" aria-label="Dashboard AI conversation">
    <article
      v-for="message in visibleAgentMessages"
      :key="message.id"
      class="message"
      :class="message.role === 'assistant' ? 'ai' : 'user'"
      :aria-label="messageAriaLabel(message)"
    >
      <div class="message-avatar" aria-hidden="true">{{ message.role === 'assistant' ? 'AI' : 'You' }}</div>
      <div class="message-content">
        <div class="message-bubble" :class="[message.role === 'assistant' ? 'ai' : 'user', `message-bubble--${message.kind}`]">
          <strong
            v-if="message.title"
            :class="{ 'thinking-label': message.kind === 'loading' }"
          >{{ message.title }}</strong>
          <span v-if="message.body">{{ message.body }}</span>
          <ul v-if="message.details?.length" class="message-detail-list">
            <li v-for="detail in message.details" :key="detail">{{ detail }}</li>
          </ul>
          <div v-if="message.actions?.length" class="message-suggestions">
            <button
              v-for="action in message.actions"
              :key="`${message.id}-${action.id}`"
              type="button"
              class="suggestion-btn"
              :aria-label="action.label"
              @click="emit('messageAction', action.id, message.id)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
    </article>
    <div ref="chatEnd" class="chat-scroll-anchor" aria-hidden="true"></div>
  </div>
</template>
