<script setup lang="ts">
import type { AdminDataSourceApiWorkflowTemplate } from './admin-data-source-api-workflow-templates';

defineProps<{
  templates: AdminDataSourceApiWorkflowTemplate[];
}>();

defineEmits<{
  apply: [template: AdminDataSourceApiWorkflowTemplate];
}>();
</script>

<template>
  <section class="api-workflow-template-bar" aria-label="API workflow templates">
    <div>
      <strong>Start from a template</strong>
      <span>Apply a common API pattern, then adjust URL, credentials, filters, and mapping.</span>
    </div>
    <div class="api-workflow-template-actions">
      <button
        v-for="template in templates"
        :key="template.label"
        class="admin-secondary-button"
        type="button"
        :title="template.description"
        @click="$emit('apply', template)"
      >
        {{ template.label }}
      </button>
    </div>
  </section>
</template>
