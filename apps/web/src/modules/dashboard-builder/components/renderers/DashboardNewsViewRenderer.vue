<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardElement } from '../../types';

const props = defineProps<{
  element: DashboardElement;
}>();

const config = computed(() => props.element.config ?? {});
const title = computed(() => readString(config.value.newsTitle) ?? readString(config.value.title) ?? props.element.name);
const sourceLabel = computed(() => readString(config.value.sourceLabel) ?? 'Dashboard updates');
const maxItems = computed(() => readNumber(config.value.maxItems) ?? 5);
const items = computed(() => {
  const configured = Array.isArray(config.value.items)
    ? config.value.items.flatMap(item => normalizeNewsItem(item))
    : [];
  if (configured.length > 0) return configured.slice(0, maxItems.value);
  return [
    { title: 'Sales trend updated', summary: 'The latest dashboard data is ready for review.', meta: sourceLabel.value },
    { title: 'Operational signal', summary: 'Use filters to focus this view on a location, period, or segment.', meta: 'Insight' },
    { title: 'Manual note', summary: 'Configure this News View from the manual sidebar.', meta: 'Editor' }
  ].slice(0, maxItems.value);
});

function normalizeNewsItem(value: unknown): Array<{ meta: string; summary: string; title: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  return [{
    meta: readString(record.meta) ?? readString(record.source) ?? sourceLabel.value,
    summary: readString(record.summary) ?? readString(record.description) ?? '',
    title: readString(record.title) ?? 'News item'
  }];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
</script>

<template>
  <section class="dashboard-news-renderer" :aria-label="title">
    <header>
      <p>{{ sourceLabel }}</p>
      <h3>{{ title }}</h3>
    </header>
    <article v-for="item in items" :key="`${item.meta}-${item.title}`">
      <span>{{ item.meta }}</span>
      <h4>{{ item.title }}</h4>
      <p>{{ item.summary }}</p>
    </article>
  </section>
</template>
