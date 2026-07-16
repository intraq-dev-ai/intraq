<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AdminDashboardCategoriesPage from '../admin-dashboard-categories/AdminDashboardCategoriesPage.vue';
import AdminDashboardManagementPage from '../admin-dashboard-management/AdminDashboardManagementPage.vue';
import AdminBaseProductResourceSurface from './components/AdminBaseProductResourceSurface.vue';
import AdminBaseProductSummarySurface from './components/AdminBaseProductSummarySurface.vue';
import AdminCustomDataSourcesSurface from './components/AdminCustomDataSourcesSurface.vue';
import AdminResourceSurface from './components/AdminResourceSurface.vue';
import AdminSmtpConfigurationSurface from './components/AdminSmtpConfigurationSurface.vue';
import AdminSummarySurface from './components/AdminSummarySurface.vue';
import { resolveAdminSurface } from './surfaces';
import './admin.css';

const route = useRoute();

const surface = computed(() => {
  const sectionParam = route.params.section;
  const sections = Array.isArray(sectionParam)
    ? sectionParam
    : sectionParam ? [String(sectionParam)] : [];
  return resolveAdminSurface(sections);
});

const isDashboardManagement = computed(() => surface.value.id === 'dashboards');
const isDashboardCategories = computed(() => surface.value.id === 'dashboard-categories');
const isCustomDataSources = computed(() => surface.value.id === 'custom-data-sources');
const isSmtpConfiguration = computed(() => surface.value.id === 'smtp-configuration');
const isBaseProductSummary = computed(() => ['dashboard', 'overview', 'settings', 'sql-query-editor'].includes(surface.value.id));
const isBaseProductResource = computed(() => [
  'data-sources',
  'view-data-sources'
].includes(surface.value.id));
</script>

<template>
  <AdminDashboardManagementPage
    v-if="surface.kind === 'resource' && isDashboardManagement"
    :key="surface.id"
  />
  <AdminDashboardCategoriesPage
    v-else-if="surface.kind === 'resource' && isDashboardCategories"
    :key="surface.id"
  />
  <AdminCustomDataSourcesSurface
    v-else-if="surface.kind === 'resource' && isCustomDataSources"
    :key="surface.id"
    :surface="surface"
  />
  <AdminSmtpConfigurationSurface
    v-else-if="surface.kind === 'resource' && isSmtpConfiguration"
    :key="surface.id"
    :surface="surface"
  />
  <AdminBaseProductSummarySurface
    v-else-if="surface.kind === 'summary' && isBaseProductSummary"
    :key="surface.id"
    :surface="surface"
  />
  <AdminBaseProductResourceSurface
    v-else-if="surface.kind === 'resource' && isBaseProductResource"
    :key="surface.id"
    :surface="surface"
  />
  <AdminResourceSurface
    v-else-if="surface.kind === 'resource'"
    :key="surface.id"
    :surface="surface"
  />
  <AdminSummarySurface
    v-else
    :key="surface.id"
    :surface="surface"
  />
</template>
