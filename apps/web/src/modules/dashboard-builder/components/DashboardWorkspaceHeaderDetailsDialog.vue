<script setup lang="ts">
import { onMounted, ref } from 'vue';

defineProps<{
  canUseDashboard: boolean;
  categoryOptions: Array<{ id: string; name: string }>;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [];
}>();

const name = defineModel<string>('name', { required: true });
const selectedCategoryId = defineModel<string>('selectedCategoryId', { required: true });
const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => {
  dialogEl.value?.focus();
});
</script>

<template>
  <div class="dashboard-details-modal modal-overlay" role="presentation" @click.self="emit('close')">
    <section
      ref="dialogEl"
      class="dashboard-details-dialog modal-content"
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard details"
      tabindex="-1"
      @keydown.esc="emit('close')"
    >
      <div class="modal-header">
        <h3 class="font-bold text-lg">Dashboard Details</h3>
        <button type="button" class="modal-close-btn" aria-label="Close dashboard details" @click="emit('close')">
          &times;
        </button>
      </div>
      <form class="dashboard-rename-form" aria-label="Rename dashboard" @submit.prevent="emit('submit')">
        <div class="modal-body">
          <label>
            New name
            <input v-model="name" :disabled="!canUseDashboard" required>
          </label>
          <label>
            Category
            <select v-model="selectedCategoryId" :disabled="!canUseDashboard">
              <option value="">Default (No Category)</option>
              <option v-for="category in categoryOptions" :key="category.id" :value="category.id">
                {{ category.name }}
              </option>
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button class="dashboard-dialog-secondary" type="button" :disabled="isSaving" @click="emit('close')">
            Cancel
          </button>
          <button class="dashboard-dialog-primary" type="submit" :disabled="!canUseDashboard || isSaving">
            Update details
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
