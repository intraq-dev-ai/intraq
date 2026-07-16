<script setup lang="ts">
import type { DashboardTemplateDefinition } from './template-definitions';
import TemplatePreviewItem from './TemplatePreviewItem.vue';

defineProps<{
  template: DashboardTemplateDefinition;
  inline?: boolean;
}>();
</script>

<template>
  <div v-if="inline" class="template-preview-inline">
    <div class="template-preview-inline-frame">
      <div class="template-preview-body">
        <div class="template-preview-grid" :class="{ 'template-preview-grid--compact': template.id === 'revenue_signals' }">
          <TemplatePreviewItem
            v-for="(item, index) in template.previewLayout"
            :key="`${item.type}-${index}`"
            :index="index"
            :item="item"
            :template="template"
          />
        </div>
      </div>
    </div>
  </div>
  <div v-else class="template-preview-body">
    <div class="template-preview-grid" :class="{ 'template-preview-grid--compact': template.id === 'revenue_signals' }">
      <TemplatePreviewItem
        v-for="(item, index) in template.previewLayout"
        :key="`${item.type}-${index}`"
        :index="index"
        :item="item"
        :template="template"
      />
    </div>
  </div>
</template>
