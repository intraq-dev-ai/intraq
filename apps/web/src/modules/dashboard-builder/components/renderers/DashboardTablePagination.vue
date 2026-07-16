<script setup lang="ts">
import { nextTick } from 'vue';

const currentPage = defineModel<number>('currentPage', { required: true });
const selectedPageSize = defineModel<number | null>('selectedPageSize', { required: true });

const props = defineProps<{
  elementName: string;
  pageOptions: number[];
  rangeText: string;
  totalPages: number;
  visiblePages: number[];
}>();

function goToTablePage(delta: number, event?: Event): void {
  updateTablePageWithoutScrollJump(() => {
    currentPage.value = Math.min(props.totalPages, Math.max(1, currentPage.value + delta));
  }, event);
}

function setTablePage(page: number, event?: Event): void {
  updateTablePageWithoutScrollJump(() => {
    currentPage.value = Math.min(props.totalPages, Math.max(1, page));
  }, event);
}

function onTablePageSelect(event: Event): void {
  setTablePage(Number((event.target as HTMLSelectElement).value), event);
}

function updateTablePageWithoutScrollJump(update: () => void, event?: Event): void {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const eventTarget = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  update();
  void nextTick(() => {
    window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });
    const focusTarget = eventTarget?.isConnected ? eventTarget : activeElement?.isConnected ? activeElement : null;
    focusTarget?.focus({ preventScroll: true });
  });
}
</script>

<template>
  <nav class="dashboard-table-pagination" :aria-label="`Table pagination for ${elementName}`">
    <span class="dashboard-table-pagination-range">{{ rangeText }}</span>
    <div class="dashboard-table-pagination-controls">
      <label class="dashboard-table-page-size">
        <span>Rows per page</span>
        <select v-model.number="selectedPageSize" :aria-label="`Rows per page for ${elementName}`">
          <option v-for="size in pageOptions" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>
      <button type="button" :disabled="currentPage <= 1" @click.prevent="goToTablePage(-1, $event)">Previous</button>
      <label class="dashboard-table-page-select">
        <span>Page</span>
        <select :value="currentPage" :aria-label="`Page for ${elementName}`" @change="onTablePageSelect">
          <option v-for="page in visiblePages" :key="page" :value="page">{{ page }}</option>
        </select>
        <span>of {{ totalPages }}</span>
      </label>
      <button type="button" :disabled="currentPage >= totalPages" @click.prevent="goToTablePage(1, $event)">Next</button>
    </div>
  </nav>
</template>
