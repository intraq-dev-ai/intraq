<script setup lang="ts">
import type { DashboardVersion } from '../types';

defineProps<{
  canEditDashboard: boolean;
  versions: DashboardVersion[];
}>();

const emit = defineEmits<{
  restore: [versionId: string];
}>();
</script>

<template>
  <section class="dashboard-version-panel" aria-label="Dashboard version history">
    <div class="dashboard-version-header">
      <h2>Version History</h2>
      <span v-if="canEditDashboard" class="muted">Publish to create a rollback point.</span>
    </div>
    <ul class="dashboard-version-list">
      <li v-for="version in versions" :key="version.id">
        <span>{{ version.name }} · {{ version.status }}</span>
        <button v-if="canEditDashboard" class="secondary-button" type="button" :aria-label="`Restore ${version.name}`" @click="emit('restore', version.id)">Restore</button>
      </li>
    </ul>
    <p v-if="versions.length === 0" class="muted">No published versions yet.</p>
  </section>
</template>
