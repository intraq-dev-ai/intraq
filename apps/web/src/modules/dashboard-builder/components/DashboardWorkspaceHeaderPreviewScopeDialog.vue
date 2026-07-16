<script setup lang="ts">
import { onMounted, ref } from 'vue';

defineProps<{
  error: string;
}>();

const emit = defineEmits<{
  clear: [];
  close: [];
  submit: [];
}>();

const companyId = defineModel<string>('companyId', { required: true });
const locationIds = defineModel<string>('locationIds', { required: true });
const extraJson = defineModel<string>('extraJson', { required: true });
const dialogEl = ref<HTMLElement | null>(null);

onMounted(() => {
  dialogEl.value?.focus();
});
</script>

<template>
  <div
    ref="dialogEl"
    class="dashboard-preview-scope-modal modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dashboard-preview-scope-title"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <form class="modal-content dashboard-preview-scope-dialog" aria-label="Preview data scope" @submit.prevent="emit('submit')">
      <div class="modal-header">
        <div>
          <h3 id="dashboard-preview-scope-title" class="font-bold text-lg">Preview Scope</h3>
          <p class="dashboard-preview-scope-copy">
            Use non-secret account and location values to preview row-level data scope. Embed sessions still use server-issued context.
          </p>
        </div>
        <button type="button" class="modal-close-btn" aria-label="Close preview scope" @click="emit('close')">
          &times;
        </button>
      </div>
      <div class="modal-body dashboard-preview-scope-body">
        <label class="form-group">
          <span class="form-label">Company / account ID</span>
          <input v-model="companyId" class="form-input" placeholder="2224185" autocomplete="off">
        </label>
        <label class="form-group">
          <span class="form-label">Location IDs</span>
          <input
            v-model="locationIds"
            class="form-input"
            placeholder="Optional. Defaults to the company / account ID."
            autocomplete="off"
          >
        </label>
        <label class="form-group">
          <span class="form-label">Additional values JSON</span>
          <textarea
            v-model="extraJson"
            class="form-input dashboard-preview-scope-json"
            rows="5"
            placeholder="{ &quot;region&quot;: &quot;NSW&quot; }"
          ></textarea>
        </label>
        <p v-if="error" class="dashboard-preview-scope-error" role="alert">{{ error }}</p>
      </div>
      <div class="modal-footer dashboard-preview-scope-footer">
        <button type="button" class="dashboard-dialog-secondary" @click="emit('clear')">Clear</button>
        <button type="button" class="dashboard-dialog-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" class="dashboard-dialog-primary">Apply Scope</button>
      </div>
    </form>
  </div>
</template>
