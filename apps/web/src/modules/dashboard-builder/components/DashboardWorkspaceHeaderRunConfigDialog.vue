<script setup lang="ts">
import { onMounted, ref } from 'vue';

defineProps<{
  canUseDashboard: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [];
}>();

const runtime = defineModel<string>('runtime', { required: true });
const scheduledRun = defineModel<boolean>('scheduledRun', { required: true });
const editModeRowLimit = defineModel<number | null>('editModeRowLimit', { required: true });
const viewModeRowLimit = defineModel<number>('viewModeRowLimit', { required: true });
const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => {
  dialogEl.value?.focus();
});
</script>

<template>
  <div
    ref="dialogEl"
    class="dashboard-run-settings-modal modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dashboard-run-config-title"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <form
      id="dashboard-run-config-dialog"
      class="modal-content"
      aria-label="Dashboard run configuration"
      @submit.prevent="emit('submit')"
    >
      <div class="modal-header">
        <h3 id="dashboard-run-config-title" class="font-bold text-lg">Configure Query Settings</h3>
        <button type="button" class="modal-close-btn" aria-label="Close query settings" @click="emit('close')">
          &times;
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="dashboard-run-runtime">Runtime</label>
          <select id="dashboard-run-runtime" v-model="runtime" class="form-input" :disabled="!canUseDashboard">
            <option value="databricks">Databricks</option>
            <option value="local">Local</option>
          </select>
        </div>

        <label class="dashboard-run-schedule-option">
          <input v-model="scheduledRun" type="checkbox" :disabled="!canUseDashboard">
          <span>Schedule next run</span>
        </label>

        <div class="form-group">
          <label class="form-label" for="edit-mode-row-limit">Edit Mode Row Limit</label>
          <p class="form-description">Maximum rows to fetch in Edit mode for fast preview when using the Run button.</p>
          <div class="input-group">
            <input
              id="edit-mode-row-limit"
              v-model.number="editModeRowLimit"
              type="number"
              min="1"
              max="1000"
              class="form-input"
              placeholder="Enter limit (1-1,000)"
              :disabled="!canUseDashboard"
            >
            <span class="input-suffix">rows</span>
          </div>
          <div class="limit-presets">
            <span class="preset-label">Quick presets:</span>
            <button type="button" class="preset-btn" :class="{ active: editModeRowLimit === 100 }" @click="editModeRowLimit = 100">100</button>
            <button type="button" class="preset-btn" :class="{ active: editModeRowLimit === 200 }" @click="editModeRowLimit = 200">200</button>
            <button type="button" class="preset-btn" :class="{ active: editModeRowLimit === 500 }" @click="editModeRowLimit = 500">500</button>
            <button type="button" class="preset-btn" :class="{ active: editModeRowLimit === 1000 }" @click="editModeRowLimit = 1000">1000</button>
          </div>
        </div>

        <div class="form-group mt-6">
          <label class="form-label" for="view-mode-row-limit">Max Limit</label>
          <p class="form-description">
            Maximum rows to fetch in View mode for tables without pagination. This prevents memory issues with large datasets.
          </p>
          <div class="input-group">
            <input
              id="view-mode-row-limit"
              v-model.number="viewModeRowLimit"
              type="number"
              min="1000"
              max="100000"
              class="form-input"
              placeholder="Enter limit (1,000-100,000)"
              :disabled="!canUseDashboard"
            >
            <span class="input-suffix">rows</span>
          </div>
          <div class="limit-presets">
            <span class="preset-label">Quick presets:</span>
            <button type="button" class="preset-btn" :class="{ active: viewModeRowLimit === 5000 }" @click="viewModeRowLimit = 5000">5K</button>
            <button type="button" class="preset-btn" :class="{ active: viewModeRowLimit === 10000 }" @click="viewModeRowLimit = 10000">10K</button>
            <button type="button" class="preset-btn" :class="{ active: viewModeRowLimit === 25000 }" @click="viewModeRowLimit = 25000">25K</button>
            <button type="button" class="preset-btn" :class="{ active: viewModeRowLimit === 50000 }" @click="viewModeRowLimit = 50000">50K</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="!canUseDashboard">
          Save Settings
          <span class="sr-only">Save run config</span>
        </button>
      </div>
    </form>
  </div>
</template>
