<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardElement } from '../../types';

const props = defineProps<{
  element: DashboardElement;
}>();

const config = computed(() => props.element.config ?? {});
const title = computed(() => readString(config.value.botTitle) ?? readString(config.value.title) ?? props.element.name);
const welcome = computed(() => readString(config.value.welcomeMessage) ?? 'Ask a question about this dashboard.');
const placeholder = computed(() => readString(config.value.placeholder) ?? 'Type a question...');
const suggestions = computed(() => {
  const values = Array.isArray(config.value.suggestions)
    ? config.value.suggestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  return values.length > 0 ? values : ['Summarize this dashboard', 'Which metric changed most?', 'Show recommended follow-ups'];
});

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
</script>

<template>
  <section class="dashboard-chatbot-renderer" :aria-label="title">
    <header>
      <div aria-hidden="true">AI</div>
      <h3>{{ title }}</h3>
    </header>
    <div class="chatbot-message">{{ welcome }}</div>
    <div class="chatbot-suggestions" aria-label="Suggested questions">
      <button v-for="item in suggestions" :key="item" type="button">{{ item }}</button>
    </div>
    <label>
      <span class="sr-only">Chat message</span>
      <input type="text" :placeholder="placeholder" disabled />
    </label>
  </section>
</template>
