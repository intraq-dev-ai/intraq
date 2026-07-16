<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { TableActionDialog } from './dashboard-table-renderer-types';

defineProps<{
  dialog: TableActionDialog;
}>();

const emit = defineEmits<{
  close: [];
}>();

const actionDialogEl = ref<HTMLElement | null>(null);

onMounted(() => {
  actionDialogEl.value?.focus();
});
</script>

<template>
  <div class="dashboard-table-action-overlay" @click="emit('close')">
    <section
      ref="actionDialogEl"
      class="dashboard-table-action-dialog"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="dialog.title"
      @click.stop
    >
      <header>
        <div>
          <span>{{ dialog.actionId }}</span>
          <h3>{{ dialog.title }}</h3>
        </div>
        <button type="button" aria-label="Close table action" @click="emit('close')">Close</button>
      </header>
      <p>Row {{ dialog.rowIndex + 1 }}</p>
      <table :aria-label="`${dialog.label} row details`">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in dialog.rows" :key="row.field">
            <td>{{ row.label }}</td>
            <td>{{ row.value }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
