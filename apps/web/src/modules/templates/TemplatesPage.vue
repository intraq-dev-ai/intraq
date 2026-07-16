<script setup lang="ts">
import { computed, ref } from 'vue';
import type { VNode } from 'vue';
import { useRouter } from 'vue-router';
import { fetchBuilderDataSources } from '../dashboard-builder/api';
import type {
  BuilderDataSource,
  BuilderDataTable
} from '../dashboard-builder/types';
import {
  dashboardTemplateDefinitions,
  getDashboardTemplateDefinition
} from './template-definitions';
import { createDashboardFromTemplate } from './template-dashboard-creator';
import TemplatePreview from './TemplatePreview.vue';
import TemplateUseDialog from './TemplateUseDialog.vue';
import './templates.css';

const router = useRouter();
const showPreviewModal = ref(false);
const showUseDialog = ref(false);
const selectedTemplateId = ref(dashboardTemplateDefinitions[0]?.id ?? 'sales_performance');
const dataSources = ref<BuilderDataSource[]>([]);
const dataSourcesError = ref('');
const isLoadingDataSources = ref(false);
const isCreatingDashboard = ref(false);

const templates = computed(() => dashboardTemplateDefinitions);
const selectedTemplate = computed(() => getDashboardTemplateDefinition(selectedTemplateId.value));
const status = computed(() => `${templates.value.length} dashboard templates loaded`);

async function useTemplate(templateId: string): Promise<void> {
  selectedTemplateId.value = templateId;
  showUseDialog.value = true;
  if (dataSources.value.length > 0 || isLoadingDataSources.value) return;
  isLoadingDataSources.value = true;
  dataSourcesError.value = '';
  try {
    dataSources.value = await fetchBuilderDataSources();
  } catch (error) {
    dataSourcesError.value = error instanceof Error ? error.message : 'Data sources could not be loaded.';
  } finally {
    isLoadingDataSources.value = false;
  }
}

function previewTemplate(templateId: string): void {
  selectedTemplateId.value = templateId;
  showPreviewModal.value = true;
}

function closePreview(): void {
  showPreviewModal.value = false;
}

function closeUseDialog(): void {
  if (isCreatingDashboard.value) return;
  showUseDialog.value = false;
}

async function createFromTemplate(selection: { dataSource: BuilderDataSource; table: BuilderDataTable }): Promise<void> {
  isCreatingDashboard.value = true;
  dataSourcesError.value = '';
  try {
    const dashboard = await createDashboardFromTemplate({
      dataSource: selection.dataSource,
      table: selection.table,
      template: selectedTemplate.value
    });
    showUseDialog.value = false;
    await router.push(`/dashboard/${encodeURIComponent(dashboard.id)}/edit`);
  } catch (error) {
    dataSourcesError.value = error instanceof Error ? error.message : 'Dashboard could not be created from the template.';
  } finally {
    isCreatingDashboard.value = false;
  }
}

</script>

<template>
  <section class="templates-page" aria-labelledby="templates-title">
    <header class="templates-hero">
      <h1 id="templates-title">Templates</h1>
      <p>Choose a starting point and let AI tailor it to your data.</p>
    </header>

    <p class="sr-only" role="status" aria-label="Templates status" aria-live="polite">{{ status }}</p>

    <section class="template-grid" aria-label="Template gallery">
      <article
        v-for="template in templates"
        :key="template.id"
        class="template-card"
        @click="useTemplate(template.id)"
      >
        <button
          class="template-thumbnail"
          type="button"
          :aria-label="`Preview ${template.title}`"
          @click.stop="previewTemplate(template.id)"
        >
          <div class="template-preview-mini">
            <TemplatePreview :template="template" :inline="true" />
            <span class="template-badge">Preview</span>
          </div>
        </button>

        <div class="template-info">
          <h2 class="template-title">{{ template.title }}</h2>
          <p class="template-description">{{ template.subtitle }}</p>
          <div class="template-actions">
            <button class="template-use-btn" type="button" @click.stop="useTemplate(template.id)">
              Use Template
            </button>
          </div>
        </div>
      </article>
    </section>

    <div
      v-if="showPreviewModal"
      class="template-preview-overlay"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`template-preview-${selectedTemplate.id}`"
      tabindex="-1"
      @click.self="closePreview"
      @keydown.esc="closePreview"
      @vue:mounted="(vnode: VNode) => (vnode.el as HTMLElement | null)?.focus()"
    >
      <article class="template-preview-modal" :class="{ 'template-preview-modal--wide': selectedTemplate.id === 'revenue_signals' }">
        <header class="template-preview-header">
          <div>
            <h2 :id="`template-preview-${selectedTemplate.id}`" class="template-preview-title">{{ selectedTemplate.title }}</h2>
            <p class="template-preview-subtitle">{{ selectedTemplate.subtitle }}</p>
          </div>
          <button class="template-preview-close" type="button" aria-label="Close template preview" @click="closePreview">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>
        <TemplatePreview :template="selectedTemplate" :inline="false" />
      </article>
    </div>

    <TemplateUseDialog
      v-if="showUseDialog"
      :data-sources="dataSources"
      :error="dataSourcesError"
      :is-creating="isCreatingDashboard"
      :is-loading="isLoadingDataSources"
      :template="selectedTemplate"
      @cancel="closeUseDialog"
      @create="createFromTemplate"
    />
  </section>
</template>
