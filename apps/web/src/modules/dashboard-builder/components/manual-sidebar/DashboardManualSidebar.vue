<script setup lang="ts">
import { reactive, ref } from 'vue';
import ManualCardDialogs from './ManualCardDialogs.vue';
import ManualChartDialogs from './ManualChartDialogs.vue';
import ManualConfigTab from './ManualConfigTab.vue';
import ManualSidebarEditor from './ManualSidebarEditor.vue';
import ManualSidebarPalette from './ManualSidebarPalette.vue';
import ManualMatrixDialogs from './ManualMatrixDialogs.vue';
import ManualTableDialogs from './ManualTableDialogs.vue';
import { provideManualSidebarContext } from './manualSidebarContext';
import type { ManualSidebarEmit, ManualSidebarProps } from './manualSidebarTypes';
import { useManualSidebarController } from './useManualSidebarController';

const props = defineProps<ManualSidebarProps>();
const emit = defineEmits<ManualSidebarEmit>();
const ctx = reactive(useManualSidebarController(props, emit));
const activeTab = ref<'components' | 'config'>('components');

provideManualSidebarContext(ctx);
</script>

<template>
  <aside class="dashboard-manual-sidebar" aria-label="Manual dashboard builder">
    <div class="manual-sidebar-tabs" role="tablist" aria-label="Manual builder tabs">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'components'"
        :class="['manual-sidebar-tab', { active: activeTab === 'components' }]"
        @click="activeTab = 'components'"
      >
        Elements
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'config'"
        :class="['manual-sidebar-tab', { active: activeTab === 'config' }]"
        @click="activeTab = 'config'"
      >
        Config
      </button>
    </div>
    <template v-if="activeTab === 'components'">
      <ManualSidebarPalette v-if="!ctx.selectedElement" />
      <ManualSidebarEditor v-else />
    </template>
    <ManualConfigTab v-else />
    <ManualChartDialogs />
    <ManualTableDialogs />
    <ManualCardDialogs />
    <ManualMatrixDialogs />
  </aside>
</template>

<style scoped src="./manual-sidebar-layout.css"></style>
