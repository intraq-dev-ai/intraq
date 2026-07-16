<script setup lang="ts">
import type { TableDrillState } from './dashboard-table-renderer-types';

defineProps<{
  drillState: TableDrillState;
  matchingRowCount: number;
}>();

const emit = defineEmits<{
  clear: [];
}>();
</script>

<template>
  <div class="dashboard-table-drill-banner" role="status" :aria-label="`Drilled into ${drillState.value}`">
    <div>
      <span>Drill</span>
      <strong>{{ drillState.label }} = {{ drillState.value }}</strong>
      <small>{{ matchingRowCount }} matching rows</small>
    </div>
    <button type="button" @click="emit('clear')">Go Back</button>
  </div>
</template>
