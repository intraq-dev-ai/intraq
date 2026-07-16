<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import ProfileDropdown from '../../shell/ProfileDropdown.vue';
import { useTenantBranding } from '../../shell/useTenantBranding';
import {
  dashboardBadges,
  dashboardPath,
  groupDashboardSections,
  isDashboardFavorite
} from '../dashboard-sidebar-model';
import type { Dashboard } from '../types';

const props = defineProps<{
  aiFeaturesEnabled?: boolean;
  canEditDashboard: boolean;
  dashboards: Dashboard[];
  recentDashboardId: string;
  roleKey: string;
  selectedDashboard: Dashboard | null;
  userEmail: string;
  userName: string;
  userRole: string;
}>();

const emit = defineEmits<{
  newDashboard: [name: string, prompt?: string];
}>();

const searchQuery = ref('');
const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0);
const filteredDashboards = computed(() => props.dashboards.filter(dashboard => dashboardMatchesSearch(dashboard, searchQuery.value)));
const sections = computed(() => groupDashboardSections(filteredDashboards.value, props.selectedDashboard?.id ?? props.recentDashboardId));
const expandedSections = ref<Record<string, boolean>>({});
const nonSearchExpandedSections = ref<Record<string, boolean>>({});
const newDashboardDialogOpen = ref(false);
const newDashboardName = ref('New Dashboard');
const newDashboardInput = ref<HTMLInputElement | null>(null);
const newDashboardDialogEl = ref<HTMLElement | null>(null);
const aiDialogOpen = ref(false);
const aiPrompt = ref('');
const aiPromptInput = ref<HTMLInputElement | null>(null);
const aiDialogEl = ref<HTMLElement | null>(null);
const { tenantBranding } = useTenantBranding();
const aiSuggestions = [
  'Create Sales dashboard',
  'Give me staff report',
  'Show revenue trends',
  'Customer analytics',
  'Inventory overview'
];
const showAiDashboardAssistant = computed(() => props.aiFeaturesEnabled !== false);

watch([sections, hasSearchQuery], ([nextSections, isSearching]) => {
  if (isSearching) {
    expandedSections.value = Object.fromEntries(nextSections.map(section => [section.id, true]));
    return;
  }
  const nextExpanded = Object.fromEntries(nextSections.map(section => [
    section.id,
    nonSearchExpandedSections.value[section.id] ?? section.expandedByDefault
  ]));
  nonSearchExpandedSections.value = nextExpanded;
  expandedSections.value = nextExpanded;
}, { immediate: true });

function toggleSection(sectionId: string): void {
  const nextExpanded = {
    ...expandedSections.value,
    [sectionId]: !expandedSections.value[sectionId]
  };
  expandedSections.value = nextExpanded;
  if (!hasSearchQuery.value) nonSearchExpandedSections.value = nextExpanded;
}

async function openNewDashboardDialog(): Promise<void> {
  newDashboardName.value = 'New Dashboard';
  newDashboardDialogOpen.value = true;
  await nextTick();
  newDashboardDialogEl.value?.focus();
  newDashboardInput.value?.select();
}

function closeNewDashboardDialog(): void {
  newDashboardDialogOpen.value = false;
}

function submitNewDashboard(): void {
  const name = newDashboardName.value.trim() || 'New Dashboard';
  emit('newDashboard', name);
  closeNewDashboardDialog();
}

async function openAiDialog(): Promise<void> {
  if (!showAiDashboardAssistant.value) return;
  aiPrompt.value = '';
  aiDialogOpen.value = true;
  await nextTick();
  aiDialogEl.value?.focus();
  aiPromptInput.value?.focus();
}

function closeAiDialog(): void {
  aiDialogOpen.value = false;
}

function submitAiDashboard(): void {
  const prompt = aiPrompt.value.trim();
  if (!prompt) return;
  emit('newDashboard', 'New Dashboard', prompt);
  closeAiDialog();
}

function selectAiSuggestion(suggestion: string): void {
  aiPrompt.value = suggestion;
  submitAiDashboard();
}

function dashboardMatchesSearch(dashboard: Dashboard, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [
    dashboard.name,
    dashboard.category,
    dashboard.tenant?.name,
    dashboard.status,
    isDashboardFavorite(dashboard) ? 'favorite' : ''
  ].some(value => value?.toLowerCase().includes(term));
}

</script>

<template>
  <nav class="dashboard-list-panel dashboard-sidebar-menu" aria-labelledby="dashboard-list-title">
    <div class="dashboard-sidebar-header">
      <div class="dashboard-brand">
        <div class="dashboard-brand-text">
          <span id="dashboard-list-title" class="dashboard-brand-title">{{ tenantBranding.displayName }}</span>
          <span v-if="tenantBranding.subHeader" class="dashboard-brand-subtitle">{{ tenantBranding.subHeader }}</span>
        </div>
      </div>
    </div>
    <div class="dashboard-menu-search">
      <label class="sr-only" for="dashboard-menu-search-input">Search dashboards</label>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
      </svg>
      <input
        id="dashboard-menu-search-input"
        v-model="searchQuery"
        type="search"
        placeholder="Search dashboards"
        aria-label="Search dashboards"
      >
    </div>
    <div class="dashboard-sections" aria-label="Dashboard menu sections">
      <section v-for="section in sections" :key="section.id" class="dashboard-section">
        <button
          class="section-header"
          type="button"
          :aria-expanded="expandedSections[section.id] ?? false"
          :aria-controls="`dashboard-section-${section.id}`"
          @click="toggleSection(section.id)"
        >
          <span class="dashboard-section-title" :title="section.label">{{ section.label }}</span>
          <svg
            class="section-toggle"
            :class="{ expanded: expandedSections[section.id] }"
            aria-hidden="true"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <ul
          v-show="expandedSections[section.id]"
          :id="`dashboard-section-${section.id}`"
          class="dashboard-list"
          :aria-label="`${section.label} dashboards`"
        >
          <li v-for="dashboard in section.dashboards" :key="dashboard.id" class="dashboard-list-row">
            <RouterLink
              class="dashboard-list-item"
              :to="dashboardPath(dashboard.id, canEditDashboard)"
              :aria-current="dashboard.id === selectedDashboard?.id ? 'page' : undefined"
              :aria-label="`Open dashboard ${dashboard.name}`"
            >
              <span class="dashboard-indicator" :class="dashboard.isGlobal || dashboard.isGloballyVisible || dashboard.isSample ? 'global' : 'tenant'"></span>
              <span class="dashboard-item-content">
                <span class="dashboard-name">{{ dashboard.name }}</span>
                <span class="dashboard-badges">
                  <span
                    v-for="badge in dashboardBadges(dashboard)"
                    :key="badge.label"
                    class="badge"
                    :class="badge.className"
                  >
                    {{ badge.label }}
                  </span>
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>
      <p v-if="sections.length === 0" class="dashboard-empty-menu">{{ dashboards.length === 0 ? 'No dashboards yet.' : 'No dashboards match your search.' }}</p>
    </div>
    <div class="dashboard-sidebar-footer">
      <div class="dashboard-footer-actions">
        <button class="dashboard-add-btn" type="button" aria-label="New Dashboard" @click="openNewDashboardDialog">
          <svg class="dashboard-add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14" />
          </svg>
          Add New
        </button>
        <RouterLink class="dashboard-home-btn" to="/home" aria-label="Home" title="Home">
          <svg class="dashboard-home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10" />
          </svg>
        </RouterLink>
        <button v-if="showAiDashboardAssistant" class="dashboard-ai-btn" type="button" aria-label="AI Assistant" title="AI Dashboard Assistant" @click="openAiDialog">
          <svg class="dashboard-ai-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </button>
      </div>
      <div class="dashboard-sidebar-profile">
        <ProfileDropdown :user-name="userName" :user-email="userEmail" :user-role="userRole" :role-key="roleKey" variant="dark" />
      </div>
    </div>

    <div v-if="newDashboardDialogOpen" class="dashboard-new-dialog-backdrop" role="presentation" @click="closeNewDashboardDialog">
      <form
        ref="newDashboardDialogEl"
        class="dashboard-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-new-dialog-title"
        tabindex="-1"
        @click.stop
        @keydown.esc="closeNewDashboardDialog"
        @submit.prevent="submitNewDashboard"
      >
        <header>
          <h3 id="dashboard-new-dialog-title">New dashboard</h3>
        </header>
        <label>
          Dashboard name
          <input ref="newDashboardInput" v-model="newDashboardName" required>
        </label>
        <footer>
          <button class="dashboard-dialog-secondary" type="button" @click="closeNewDashboardDialog">Cancel</button>
          <button class="dashboard-dialog-primary" type="submit">Create dashboard</button>
        </footer>
      </form>
    </div>

    <div v-if="showAiDashboardAssistant && aiDialogOpen" class="dashboard-new-dialog-backdrop" role="presentation" @click="closeAiDialog">
      <form
        ref="aiDialogEl"
        class="dashboard-new-dialog dashboard-ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-ai-dialog-title"
        tabindex="-1"
        @click.stop
        @keydown.esc="closeAiDialog"
        @submit.prevent="submitAiDashboard"
      >
        <header class="dashboard-ai-dialog-header">
          <div class="dashboard-ai-dialog-heading">
            <svg class="dashboard-ai-dialog-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h3 id="dashboard-ai-dialog-title">AI Dashboard Assistant</h3>
          </div>
          <button
            class="dashboard-ai-dialog-close"
            type="button"
            aria-label="Close AI Dashboard Assistant"
            title="Close"
            @click="closeAiDialog"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div class="dashboard-ai-dialog-body">
          <div class="dashboard-ai-message">
            <div class="dashboard-ai-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div class="dashboard-ai-message-content">
              <p class="dashboard-ai-message-text">Hello! What dashboard would you like me to create for you today?</p>
            </div>
          </div>

          <div class="dashboard-ai-suggestions">
            <p class="dashboard-ai-suggestions-label">Quick suggestions:</p>
            <div class="dashboard-ai-suggestion-list">
              <button
                v-for="suggestion in aiSuggestions"
                :key="suggestion"
                type="button"
                class="dashboard-ai-suggestion-chip"
                @click="selectAiSuggestion(suggestion)"
              >
                {{ suggestion }}
              </button>
            </div>
          </div>
        </div>
        <footer class="dashboard-ai-dialog-footer">
          <div class="dashboard-ai-input-stack">
            <label class="sr-only" for="dashboard-ai-quick-prompt">Describe dashboard</label>
            <input
              id="dashboard-ai-quick-prompt"
              ref="aiPromptInput"
              v-model="aiPrompt"
              type="text"
              class="dashboard-ai-input"
              placeholder="Describe the dashboard you want to create..."
              @keydown.esc="closeAiDialog"
            >
            <button
              class="dashboard-ai-send-btn"
              type="submit"
              :disabled="!aiPrompt.trim()"
              title="Create Dashboard"
              aria-label="Create Dashboard"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </footer>
      </form>
    </div>
  </nav>
</template>
