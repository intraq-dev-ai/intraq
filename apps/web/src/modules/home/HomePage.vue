<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchHomeConversations, fetchHomeDashboards } from './api';
import type { HomeConversation, HomeDashboard } from './types';
import './home.css';

const fallbackPrompts = [
  'What were my total sales yesterday?',
  'Which items sold the most this week?',
  'How does this week compare to last week?',
  'What is my busiest hour on Fridays?',
  'Show me my top 10 products by revenue',
  'How did this month compare to last month?'
];

const router = useRouter();
const userQuery = ref('');
const prompts = ref<string[]>(fallbackPrompts);
const promptIndex = ref(0);
const recentConversations = ref<HomeConversation[]>([]);
const recentDashboards = ref<HomeDashboard[]>([]);
const status = ref('Loading workspace activity');
let rotationId: number | undefined;

const currentPlaceholder = computed(() => `Try: "${prompts.value[promptIndex.value] ?? fallbackPrompts[0]}"`);

onMounted(async () => {
  startPromptRotation();
  await loadRecentActivity();
  status.value = 'Workspace activity loaded';
});

onUnmounted(() => {
  if (rotationId !== undefined) window.clearInterval(rotationId);
});

async function loadRecentActivity(): Promise<void> {
  const [conversationResult, dashboardResult] = await Promise.allSettled([
    fetchHomeConversations(),
    fetchHomeDashboards()
  ]);

  if (conversationResult.status === 'fulfilled') {
    recentConversations.value = sortNewest(conversationResult.value).slice(0, 4);
  }
  if (dashboardResult.status === 'fulfilled') {
    recentDashboards.value = sortNewest(dashboardResult.value).slice(0, 4);
  }
}

async function askFromHome(): Promise<void> {
  const prompt = userQuery.value.trim();
  if (!prompt) return;
  await router.push({
    path: '/ai-analyzer',
    query: { prompt, autoSubmit: 'true' }
  });
}

function startPromptRotation(): void {
  if (rotationId !== undefined) window.clearInterval(rotationId);
  rotationId = window.setInterval(() => {
    promptIndex.value = (promptIndex.value + 1) % prompts.value.length;
  }, 3000);
}

function sortNewest<TItem extends { updatedAt?: string; createdAt?: string }>(items: TItem[]): TItem[] {
  return [...items].sort((left, right) => timestamp(right) - timestamp(left));
}

function timestamp(item: { updatedAt?: string; createdAt?: string }): number {
  return new Date(item.updatedAt ?? item.createdAt ?? 0).getTime();
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
</script>

<template>
  <section class="home-page centered-home" aria-labelledby="home-title">
    <section class="hero">
      <h1 id="home-title" class="hero-title">What would you like to know about your business?</h1>
      <form class="hero-card" aria-label="Home prompt" @submit.prevent="askFromHome">
        <label class="home-sr-only" for="home-prompt">Question</label>
        <div class="prompt-box">
          <textarea
            id="home-prompt"
            v-model="userQuery"
            class="prompt-input"
            rows="3"
            :placeholder="currentPlaceholder"
            @keydown.enter.exact.prevent="askFromHome"
          ></textarea>
          <button class="prompt-send" type="submit" :disabled="!userQuery.trim()" aria-label="Send message" title="Send">
            <svg class="prompt-send-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
      <p class="home-status home-sr-only" role="status" aria-label="Home status">{{ status }}</p>
    </section>

    <section v-if="recentConversations.length > 0 || recentDashboards.length > 0" class="recent-section" aria-label="Recent activity">
      <div v-if="recentConversations.length > 0" class="content-section" aria-labelledby="recent-conversations-title">
        <div class="home-section-header">
          <h2 id="recent-conversations-title">Recent Conversations</h2>
          <button class="link-btn" type="button" @click="router.push('/ai-analyzer')">View all</button>
        </div>
        <div class="recent-grid" aria-label="Recent analyzer conversations">
          <RouterLink
            v-for="conversation in recentConversations"
            :key="conversation.id"
            class="recent-card"
            :to="`/ai-analyzer/${conversation.id}`"
          >
            <span class="recent-icon" aria-hidden="true">⋯</span>
            <span class="recent-info">
              <span class="recent-title">{{ conversation.title || 'Conversation' }}</span>
              <span class="recent-date">{{ formatDate(conversation.updatedAt ?? conversation.createdAt) }}</span>
            </span>
            <span class="recent-arrow" aria-hidden="true">›</span>
          </RouterLink>
        </div>
      </div>

      <div v-if="recentDashboards.length > 0" class="content-section" aria-labelledby="recent-dashboard-title">
        <div class="home-section-header">
          <h2 id="recent-dashboard-title">Recent Dashboards</h2>
          <button class="link-btn" type="button" @click="router.push('/dashboard')">View all</button>
        </div>
        <div class="recent-grid" aria-label="Recent dashboards">
          <RouterLink
            v-for="dashboard in recentDashboards"
            :key="dashboard.id"
            class="recent-card"
            :to="`/dashboard/${dashboard.id}`"
          >
            <span class="recent-icon" aria-hidden="true">▥</span>
            <span class="recent-info">
              <span class="recent-title">{{ dashboard.name }}</span>
              <span class="recent-date">{{ formatDate(dashboard.updatedAt ?? dashboard.createdAt) }}</span>
            </span>
            <span class="recent-arrow" aria-hidden="true">›</span>
          </RouterLink>
        </div>
      </div>
    </section>
  </section>
</template>
