<script setup lang="ts">
defineProps<{
  dashboardName: string;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<template>
  <div
    class="dashboard-delete-confirm-modal modal-overlay"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="dashboard-delete-confirm-title"
    aria-describedby="dashboard-delete-confirm-description"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <section class="dashboard-delete-confirm-card">
      <div class="dashboard-delete-confirm-copy">
        <h3 id="dashboard-delete-confirm-title">Delete Dashboard</h3>
        <p id="dashboard-delete-confirm-description">
          Delete <strong>{{ dashboardName }}</strong>? This cannot be undone.
        </p>
      </div>
      <div class="dashboard-confirm-actions">
        <button class="dashboard-dialog-secondary" type="button" :disabled="isSaving" @click="emit('close')">
          Cancel
        </button>
        <button class="dashboard-delete-confirm-btn" type="button" :disabled="isSaving" @click="emit('confirm')">
          Delete Dashboard
        </button>
      </div>
    </section>
  </div>
</template>
