<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  dashboardName: string;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  createDashboard: [];
  'update:dashboardName': [value: string];
}>();

const dialogEl = ref<HTMLElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);

onMounted(() => { dialogEl.value?.focus(); });

watch(() => props.dashboardName, async () => {
  await nextTick();
  nameInput.value?.select();
}, { immediate: true });

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : '';
}
</script>

<template>
  <div class="dashboard-new-dialog-backdrop dashboard-create-dialog-backdrop" role="presentation" @click="emit('cancel')">
    <form
      ref="dialogEl"
      class="dashboard-new-dialog dashboard-create-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-create-dialog-title"
      tabindex="-1"
      @click.stop
      @submit.prevent="emit('createDashboard')"
      @keydown.esc="emit('cancel')"
    >
      <header>
        <p class="dashboard-dialog-eyebrow">Dashboard Builder</p>
        <h3 id="dashboard-create-dialog-title">New dashboard</h3>
      </header>
      <label>
        Dashboard name
        <input
          ref="nameInput"
          :value="dashboardName"
          autocomplete="off"
          required
          @input="emit('update:dashboardName', inputValue($event))"
        >
      </label>
      <footer>
        <button class="dashboard-dialog-secondary" type="button" @click="emit('cancel')">Cancel</button>
        <button class="dashboard-dialog-primary" type="submit" :disabled="isSaving">Create dashboard</button>
      </footer>
    </form>
  </div>
</template>
