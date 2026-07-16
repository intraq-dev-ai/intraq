<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  dashboardPath,
  favoriteDashboards,
  isDashboardFavorite,
  recentDashboards
} from '../dashboard-sidebar-model';
import type { Dashboard } from '../types';

const props = defineProps<{
  dashboards: Dashboard[];
  isSaving: boolean;
  recentDashboardIds: string[];
}>();

const emit = defineEmits<{
  importDashboard: [];
  setDashboardFavorite: [payload: { dashboardId: string; isFavorite: boolean }];
}>();

const optimisticFavorites = ref<Map<string, boolean>>(new Map());

watch(() => props.dashboards, (dashboards) => {
  for (const dashboard of dashboards) {
    const pending = optimisticFavorites.value.get(dashboard.id);
    if (pending !== undefined && pending === isDashboardFavorite(dashboard)) {
      optimisticFavorites.value.delete(dashboard.id);
    }
  }
}, { deep: true });

function isFavorite(dashboard: Dashboard): boolean {
  const pending = optimisticFavorites.value.get(dashboard.id);
  return pending ?? isDashboardFavorite(dashboard);
}

const recentItems = computed(() => recentDashboards(props.dashboards, props.recentDashboardIds, 6));
const favoriteItems = computed(() => favoriteDashboards(props.dashboards));

function toggleFavorite(dashboard: Dashboard): void {
  const newValue = !isFavorite(dashboard);
  optimisticFavorites.value.set(dashboard.id, newValue);
  emit('setDashboardFavorite', {
    dashboardId: dashboard.id,
    isFavorite: newValue
  });
}

function formattedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}
</script>

<template>
  <div class="dashboard-home">
    <header class="dashboard-home-header">
      <div>
        <h1 id="dashboard-home-title">Dashboards</h1>
        <p>{{ dashboards.length }} dashboards available</p>
      </div>
      <div class="dashboard-home-actions">
        <RouterLink class="dashboard-home-primary" to="/dashboard/create">New Dashboard</RouterLink>
      </div>
    </header>

    <section class="dashboard-home-section" aria-labelledby="recent-dashboards-title">
      <div class="dashboard-home-section-header">
        <h2 id="recent-dashboards-title">Recent Dashboards</h2>
        <span>Top 6 recently visited or created</span>
      </div>
      <div v-if="recentItems.length" class="dashboard-home-grid">
        <article v-for="dashboard in recentItems" :key="dashboard.id" class="dashboard-home-card">
          <RouterLink
            class="dashboard-home-card-link"
            :to="dashboardPath(dashboard.id, false)"
            :aria-label="`Open dashboard ${dashboard.name}`"
          >
            <span class="dashboard-home-card-category">{{ dashboard.category || 'Uncategorized' }}</span>
            <h3>{{ dashboard.name }}</h3>
            <p>Updated {{ formattedDate(dashboard.updatedAt) }}</p>
          </RouterLink>
          <button
            v-if="!dashboard.isSample"
            class="dashboard-home-card-star"
            :class="{ 'dashboard-home-card-star--active': isFavorite(dashboard) }"
            type="button"
            :aria-pressed="isFavorite(dashboard)"
            :aria-label="isFavorite(dashboard) ? `Remove ${dashboard.name} from favorites` : `Add ${dashboard.name} to favorites`"
            :disabled="isSaving"
            @click.stop.prevent="toggleFavorite(dashboard)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3.25 2.68 5.43 6 .87-4.34 4.23 1.02 5.98L12 16.94l-5.36 2.82 1.02-5.98L3.32 9.55l6-.87L12 3.25Z" />
            </svg>
          </button>
        </article>
      </div>
      <p v-else class="dashboard-home-empty">Create or visit a dashboard and it will appear here.</p>
    </section>

    <section class="dashboard-home-section" aria-labelledby="favorite-dashboards-title">
      <div class="dashboard-home-section-header">
        <h2 id="favorite-dashboards-title">Favorite Dashboards</h2>
        <span>Star dashboards you use most often</span>
      </div>
      <div v-if="favoriteItems.length" class="dashboard-home-grid">
        <article v-for="dashboard in favoriteItems" :key="dashboard.id" class="dashboard-home-card dashboard-home-card--favorite">
          <RouterLink
            class="dashboard-home-card-link"
            :to="dashboardPath(dashboard.id, false)"
            :aria-label="`Open dashboard ${dashboard.name}`"
          >
            <span class="dashboard-home-card-category">{{ dashboard.category || 'Uncategorized' }}</span>
            <h3>{{ dashboard.name }}</h3>
            <p>Updated {{ formattedDate(dashboard.updatedAt) }}</p>
          </RouterLink>
          <button
            v-if="!dashboard.isSample"
            class="dashboard-home-card-star dashboard-home-card-star--active"
            type="button"
            aria-pressed="true"
            :aria-label="`Remove ${dashboard.name} from favorites`"
            :disabled="isSaving"
            @click.stop.prevent="toggleFavorite(dashboard)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3.25 2.68 5.43 6 .87-4.34 4.23 1.02 5.98L12 16.94l-5.36 2.82 1.02-5.98L3.32 9.55l6-.87L12 3.25Z" />
            </svg>
          </button>
        </article>
      </div>
      <p v-else class="dashboard-home-empty">No favorite dashboards yet.</p>
    </section>
  </div>
</template>
