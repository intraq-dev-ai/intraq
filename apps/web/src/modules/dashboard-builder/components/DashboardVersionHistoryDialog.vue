<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Dashboard, DashboardVersion } from '../types';

const props = defineProps<{
  dashboard: Dashboard;
  isSaving: boolean;
  versions: DashboardVersion[];
}>();

const emit = defineEmits<{
  close: [];
  restoreVersion: [versionId: string];
}>();

const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => { dialogEl.value?.focus(); });

const versionToRestore = ref<DashboardVersion | null>(null);
const detailsVersion = ref<DashboardVersion | null>(null);
const selectedVersionIds = ref<string[]>([]);
const showCompareDialog = ref(false);
const currentVersion = computed(() => props.versions[0] ?? null);
const selectedVersions = computed(() =>
  selectedVersionIds.value
    .map(id => props.versions.find(version => version.id === id))
    .filter((version): version is DashboardVersion => Boolean(version))
);
const compareRows = computed(() => {
  const [left, right] = selectedVersions.value;
  if (!left || !right) return [];
  return [
    { field: 'Name', left: left.snapshot?.name ?? left.name, right: right.snapshot?.name ?? right.name },
    { field: 'Status', left: left.snapshot?.status ?? left.status, right: right.snapshot?.status ?? right.status },
    { field: 'Elements', left: left.snapshot?.elements.length ?? 0, right: right.snapshot?.elements.length ?? 0 },
    { field: 'Filters', left: left.snapshot?.filters.length ?? 0, right: right.snapshot?.filters.length ?? 0 }
  ];
});

function restoreSelectedVersion(): void {
  if (!versionToRestore.value) return;
  emit('restoreVersion', versionToRestore.value.id);
  versionToRestore.value = null;
}

function toggleSelectedVersion(versionId: string): void {
  if (selectedVersionIds.value.includes(versionId)) {
    selectedVersionIds.value = selectedVersionIds.value.filter(id => id !== versionId);
    return;
  }
  selectedVersionIds.value = [...selectedVersionIds.value, versionId].slice(-2);
}

function versionLabel(version: DashboardVersion): string {
  return version.versionNumber ? `Version ${version.versionNumber}` : version.name;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}
</script>

<template>
  <div class="dashboard-modal-overlay" role="presentation" @click.self="emit('close')">
    <section
      ref="dialogEl"
      class="dashboard-modal dashboard-modal--wide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-history-title"
      tabindex="-1"
      @keydown.esc="emit('close')"
    >
      <header class="dashboard-modal-header">
        <div>
          <p class="dashboard-dialog-eyebrow">{{ dashboard.name }}</p>
          <h2 id="dashboard-history-title">Version History</h2>
        </div>
        <button class="dashboard-dialog-secondary" type="button" :disabled="isSaving" @click="emit('close')">Close</button>
      </header>

      <div class="dashboard-history-toolbar">
        <div>
          <strong>{{ versions.length }}</strong>
          <span>{{ versions.length === 1 ? 'published version' : 'published versions' }}</span>
        </div>
        <div v-if="currentVersion">
          <span>Current</span>
          <strong>{{ currentVersion.name }}</strong>
        </div>
        <button
          class="dashboard-dialog-secondary"
          type="button"
          :disabled="selectedVersions.length !== 2"
          @click="showCompareDialog = true"
        >
          Compare
        </button>
        <span class="dashboard-history-note">Publishing creates a rollback point.</span>
      </div>

      <ol class="dashboard-version-list" aria-label="Dashboard version history">
        <li v-for="version in versions" :key="version.id" class="dashboard-version-item">
          <label class="dashboard-version-select">
            <input
              type="checkbox"
              :checked="selectedVersionIds.includes(version.id)"
              :disabled="selectedVersionIds.length >= 2 && !selectedVersionIds.includes(version.id)"
              :aria-label="`Select ${version.name}`"
              @change="toggleSelectedVersion(version.id)"
            >
            <span>
              <strong>{{ versionLabel(version) }}</strong>
              <small v-if="version.isAutoSave">Auto-save</small>
              <small v-if="version.id === currentVersion?.id">Current</small>
            </span>
          </label>
          <div class="dashboard-version-meta">
            <strong>{{ version.name }}</strong>
            <span>{{ version.userName ?? 'intraQ' }} · {{ formatDate(version.createdAt) }} · {{ version.status }}</span>
            <p v-if="version.comment">{{ version.comment }}</p>
          </div>
          <div class="dashboard-version-actions">
            <button class="dashboard-dialog-secondary" type="button" @click="detailsVersion = version">Details</button>
            <button
              class="dashboard-dialog-secondary"
              type="button"
              :disabled="isSaving"
              :aria-label="`Restore ${version.name}`"
              @click="versionToRestore = version"
            >
              Restore
            </button>
          </div>
        </li>
      </ol>
      <p v-if="versions.length === 0" class="dashboard-modal-empty">No published versions yet. Publish this dashboard to create a rollback point.</p>

      <section v-if="versionToRestore" class="dashboard-confirm-panel" role="alertdialog" aria-labelledby="dashboard-restore-title">
        <div>
          <h3 id="dashboard-restore-title">Restore Version</h3>
          <p>
            Restore <strong>{{ versionToRestore.name }}</strong>? This will replace the current dashboard state.
          </p>
        </div>
        <div class="dashboard-confirm-actions">
          <button class="dashboard-dialog-secondary" type="button" :disabled="isSaving" @click="versionToRestore = null">Cancel</button>
          <button class="dashboard-dialog-primary" type="button" :disabled="isSaving" @click="restoreSelectedVersion">Restore Version</button>
        </div>
      </section>

      <section v-if="detailsVersion" class="dashboard-nested-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-version-details-title">
        <header>
          <h3 id="dashboard-version-details-title">{{ versionLabel(detailsVersion) }} Details</h3>
          <button class="dashboard-dialog-secondary" type="button" @click="detailsVersion = null">Close</button>
        </header>
        <dl class="dashboard-version-details">
          <div><dt>Name</dt><dd>{{ detailsVersion.name }}</dd></div>
          <div><dt>Status</dt><dd>{{ detailsVersion.status }}</dd></div>
          <div><dt>Created</dt><dd>{{ formatDate(detailsVersion.createdAt) }}</dd></div>
          <div><dt>Components</dt><dd>{{ detailsVersion.snapshot?.elements.length ?? 0 }}</dd></div>
          <div><dt>Filters</dt><dd>{{ detailsVersion.snapshot?.filters.length ?? 0 }}</dd></div>
        </dl>
      </section>

      <section v-if="showCompareDialog" class="dashboard-nested-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-version-compare-title">
        <header>
          <h3 id="dashboard-version-compare-title">Compare Versions</h3>
          <button class="dashboard-dialog-secondary" type="button" @click="showCompareDialog = false">Close</button>
        </header>
        <table class="dashboard-version-compare-table" aria-label="Version comparison">
          <thead><tr><th>Field</th><th>{{ selectedVersions[0]?.name }}</th><th>{{ selectedVersions[1]?.name }}</th></tr></thead>
          <tbody>
            <tr v-for="row in compareRows" :key="row.field">
              <th>{{ row.field }}</th>
              <td>{{ row.left }}</td>
              <td>{{ row.right }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </section>
  </div>
</template>
