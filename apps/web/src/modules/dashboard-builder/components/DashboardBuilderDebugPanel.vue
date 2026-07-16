<script setup lang="ts">
import type { DashboardBuilderDebugPayload, DashboardBuilderDebugTab } from '../types';

defineProps<{
  activeTab: DashboardBuilderDebugTab;
  debugPayload: DashboardBuilderDebugPayload;
}>();

const emit = defineEmits<{
  close: [];
  'update:activeTab': [value: DashboardBuilderDebugTab];
}>();

function debugJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? '';
}

function selectTab(tab: DashboardBuilderDebugTab): void {
  emit('update:activeTab', tab);
}
</script>

<template>
  <section
    id="dashboard-builder-debug-sidebar"
    class="agent-debug-panel"
    role="region"
    aria-label="Dashboard builder debug sidebar"
  >
    <header class="debug-panel-header">
      <div>
        <h2>Debug Sidebar</h2>
        <p>Inspect the selected dashboard element, AI plan, data request, and runtime state.</p>
      </div>
      <button type="button" class="debug-close-btn" @click="emit('close')">Back to AI</button>
    </header>
    <div class="debug-tabs" role="tablist" aria-label="Dashboard builder debug tabs">
      <button
        id="dashboard-debug-actions-tab"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'actions'"
        aria-controls="dashboard-debug-actions-panel"
        @click="selectTab('actions')"
      >
        AI Actions
      </button>
      <button
        id="dashboard-debug-config-tab"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'config'"
        aria-controls="dashboard-debug-config-panel"
        @click="selectTab('config')"
      >
        Config
      </button>
      <button
        id="dashboard-debug-elements-tab"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'elements'"
        aria-controls="dashboard-debug-elements-panel"
        @click="selectTab('elements')"
      >
        Elements
      </button>
      <button
        id="dashboard-debug-runtime-tab"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'runtime'"
        aria-controls="dashboard-debug-runtime-panel"
        @click="selectTab('runtime')"
      >
        Runtime
      </button>
    </div>
    <div
      v-if="activeTab === 'actions'"
      id="dashboard-debug-actions-panel"
      role="tabpanel"
      aria-labelledby="dashboard-debug-actions-tab"
    >
      <article>
        <h3>Prompt</h3>
        <pre>{{ debugPayload.prompt }}</pre>
      </article>
      <article>
        <h3>Agent Action Plan</h3>
        <pre>{{ debugJson(debugPayload.actionPlan) }}</pre>
      </article>
    </div>
    <div
      v-else-if="activeTab === 'config'"
      id="dashboard-debug-config-panel"
      role="tabpanel"
      aria-labelledby="dashboard-debug-config-tab"
    >
      <article>
        <h3>Selected Element</h3>
        <pre>{{ debugJson(debugPayload.selectedElement) }}</pre>
      </article>
      <article>
        <h3>Raw Component State</h3>
        <pre>{{ debugJson(debugPayload.rawComponentState) }}</pre>
      </article>
      <article>
        <h3>Visualization Spec</h3>
        <pre>{{ debugJson(debugPayload.visualizationSpec) }}</pre>
      </article>
      <article>
        <h3>Data Request</h3>
        <pre>{{ debugJson(debugPayload.dataRequest) }}</pre>
      </article>
    </div>
    <div
      v-else-if="activeTab === 'elements'"
      id="dashboard-debug-elements-panel"
      role="tabpanel"
      aria-labelledby="dashboard-debug-elements-tab"
    >
      <article>
        <h3>Selected Data Context</h3>
        <pre>{{ debugJson({ source: debugPayload.selectedDataSource, model: debugPayload.selectedDataModel }) }}</pre>
      </article>
      <article>
        <h3>Raw Filter State</h3>
        <pre>{{ debugJson(debugPayload.rawFilterState) }}</pre>
      </article>
    </div>
    <div
      v-else
      id="dashboard-debug-runtime-panel"
      role="tabpanel"
      aria-labelledby="dashboard-debug-runtime-tab"
    >
      <article>
        <h3>Persisted Runtime State</h3>
        <pre>{{ debugJson(debugPayload.runtimeState) }}</pre>
      </article>
    </div>
  </section>
</template>
