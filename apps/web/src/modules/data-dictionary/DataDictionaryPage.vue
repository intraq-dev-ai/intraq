<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { fetchDataSources, fetchTablesForSource } from './api';
import {
  getDashboardSuggestions,
  renderMarkdown,
  tableDisplayName,
  visibleDictionarySources
} from './dictionary-utils';
import { preferredSourceId } from '../shared/source-preference';
import type { DataDictionarySource, DataDictionaryTable } from './types';
import './data-dictionary.css';

const props = withDefaults(defineProps<{ context?: 'admin' | 'customer' }>(), { context: 'customer' });
const route = useRoute();

const dataSources = ref<DataDictionarySource[]>([]);
const selectedSourceId = ref('');
const activeSection = ref('overview');
const loadError = ref('');
const isLoading = ref(false);
const mainRef = ref<HTMLElement | null>(null);
let requestId = 0;
let removeScrollListener: (() => void) | null = null;

const selectedSource = computed(() => {
  return dataSources.value.find(source => source.id === selectedSourceId.value) ?? null;
});

const selectedTables = computed(() => selectedSource.value?.tables ?? []);
const totalTables = computed(() => dataSources.value.reduce((total, source) => total + source.tables.length, 0));
const totalFields = computed(() => dataSources.value.reduce((total, source) => {
  return total + source.tables.reduce((tableTotal, table) => tableTotal + table.fields.length, 0);
}, 0));

const pageEyebrow = computed(() => props.context === 'admin' ? 'Admin' : 'Data Tools');
const pageDescription = computed(() => props.context === 'admin'
  ? 'Review governed table definitions used by SQL Builder, Analyzer, and Dashboard Builder.'
  : 'Complete documentation of available data sources and fields for building dashboards and analytics.');

const statusMessage = computed(() => {
  if (isLoading.value) return 'Loading data dictionary';
  if (loadError.value) return 'Data dictionary failed to load';
  if (dataSources.value.length === 0) return 'No data sources available';
  return `${dataSources.value.length} data source${dataSources.value.length === 1 ? '' : 's'}, ${totalTables.value} data model${totalTables.value === 1 ? '' : 's'}, ${totalFields.value} field${totalFields.value === 1 ? '' : 's'}`;
});

onMounted(() => {
  void loadDataDictionary();
  attachScrollSpy();
});

onUnmounted(() => {
  removeScrollListener?.();
});

watch(dataSources, sources => {
  const requestedSource = typeof route.query.source === 'string' ? route.query.source : '';
  selectedSourceId.value = preferredSourceId(sources, {
    currentSourceId: selectedSourceId.value,
    requestedSourceId: requestedSource
  });
});

watch(selectedSourceId, () => {
  activeSection.value = 'overview';
  scrollContainer()?.scrollTo({ top: 0, behavior: 'smooth' });
});

async function loadDataDictionary(): Promise<void> {
  const currentRequestId = ++requestId;
  isLoading.value = true;
  loadError.value = '';

  try {
    const sources = visibleDictionarySources(await fetchDataSources());
    const hydratedSources = await Promise.all(sources.map(hydrateSourceTables));
    if (currentRequestId !== requestId) return;
    dataSources.value = visibleDictionarySources(hydratedSources);
  } catch (caught) {
    if (currentRequestId !== requestId) return;
    dataSources.value = [];
    loadError.value = caught instanceof Error ? caught.message : 'Failed to load data dictionary. Please try again later.';
  } finally {
    if (currentRequestId === requestId) isLoading.value = false;
  }
}

async function hydrateSourceTables(source: DataDictionarySource): Promise<DataDictionarySource> {
  if (source.tables.length > 0) return source;
  try {
    return { ...source, tables: await fetchTablesForSource(source.id) };
  } catch {
    return source;
  }
}

function scrollToSection(sectionId: string): void {
  activeSection.value = sectionId;
  const element = document.getElementById(sectionId);
  const container = scrollContainer();
  if (!element || !container) return;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const top = elementRect.top - containerRect.top + container.scrollTop - 20;
  container.scrollTo({ top, behavior: 'smooth' });
}

function attachScrollSpy(): void {
  const container = scrollContainer();
  if (!container) return;
  const handleScroll = (): void => {
    const sectionElements = Array.from(container.querySelectorAll<HTMLElement>('section[id]'));
    const containerTop = container.getBoundingClientRect().top;
    const current = sectionElements.find(section => {
      const rect = section.getBoundingClientRect();
      const top = rect.top - containerTop;
      const bottom = rect.bottom - containerTop;
      return top <= 110 && bottom >= 110;
    });
    activeSection.value = current?.id ?? 'overview';
  };
  container.addEventListener('scroll', handleScroll);
  handleScroll();
  removeScrollListener = () => container.removeEventListener('scroll', handleScroll);
}

function scrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.home-main') ?? mainRef.value;
}

function sectionId(table: DataDictionaryTable): string {
  return `table-${table.id}`;
}
</script>

<template>
  <section class="data-dictionary-docs" :class="`data-dictionary-docs--${context}`" aria-labelledby="data-dictionary-title">
    <aside class="dictionary-sidebar" aria-labelledby="dictionary-navigation-title">
      <p id="dictionary-navigation-title" class="dictionary-sidebar-title">Data Dictionary</p>
      <a
        href="#overview"
        :aria-current="activeSection === 'overview' ? 'location' : undefined"
        @click.prevent="scrollToSection('overview')"
      >
        Overview
      </a>

      <label v-if="dataSources.length > 0" for="dictionary-source">Data Source</label>
      <select v-if="dataSources.length > 0" id="dictionary-source" v-model="selectedSourceId" aria-label="Data source">
        <option v-for="source in dataSources" :key="source.id" :value="source.id">{{ source.name }}</option>
      </select>

      <nav v-if="selectedTables.length > 0" aria-label="Data models">
        <h3>Data Models</h3>
        <a
          v-for="table in selectedTables"
          :key="table.id"
          :href="`#${sectionId(table)}`"
          :aria-current="activeSection === sectionId(table) ? 'location' : undefined"
          @click.prevent="scrollToSection(sectionId(table))"
        >
          {{ tableDisplayName(table) }}
        </a>
      </nav>
    </aside>

    <main ref="mainRef" class="dictionary-main" tabindex="-1">
      <p class="sr-only" role="status" aria-label="Data dictionary status" aria-live="polite">{{ statusMessage }}</p>

      <article v-if="isLoading" class="panel state-panel" role="status" aria-live="polite">
        Loading data dictionary.
      </article>

      <article v-else-if="loadError" class="panel error-banner" role="alert">
        {{ loadError }}
      </article>

      <div v-else class="dictionary-content">
        <section id="overview" class="dictionary-section" aria-labelledby="data-dictionary-title">
          <header class="dictionary-section-header">
            <p class="eyebrow">{{ pageEyebrow }}</p>
            <h1 id="data-dictionary-title">Data Dictionary</h1>
            <p>{{ pageDescription }}</p>
          </header>

          <div class="dictionary-stats" aria-label="Data dictionary overview metrics">
            <article class="panel"><strong>{{ dataSources.length }}</strong><span>Data Sources</span></article>
            <article class="panel"><strong>{{ totalTables }}</strong><span>Data Models</span></article>
            <article class="panel"><strong>{{ totalFields }}</strong><span>Fields</span></article>
          </div>

          <article class="panel dictionary-about">
            <h2>About This Documentation</h2>
            <p>
              This data dictionary provides comprehensive information about available data sources,
              model structure, field details, and dashboards or insights that can be built from them.
            </p>
            <ul>
              <li><strong>Data Sources</strong>: Browse available data and information systems</li>
              <li><strong>Data Models</strong>: Explore how data is organized and structured</li>
              <li><strong>Field Details</strong>: View field names, data types, and descriptions</li>
              <li><strong>Analytics Suggestions</strong>: Discover useful dashboards and insights</li>
            </ul>
          </article>
        </section>

        <section v-if="dataSources.length === 0" class="panel state-panel" role="status">
          No data sources are available. Contact your administrator to set up data sources.
        </section>

        <section
          v-for="table in selectedTables"
          :id="sectionId(table)"
          :key="table.id"
          class="panel dictionary-section dictionary-table-section"
          :aria-labelledby="`${sectionId(table)}-title`"
        >
          <header class="dictionary-table-header">
            <h2 :id="`${sectionId(table)}-title`">{{ tableDisplayName(table) }}</h2>
            <p class="table-name">{{ table.name }} · {{ table.fields.length }} fields</p>
            <div
              v-if="table.dictionaryDescription || table.description"
              class="markdown-content"
              v-html="renderMarkdown(table.dictionaryDescription || table.description)"
            ></div>
            <p v-else>No description available.</p>
          </header>

          <aside v-if="getDashboardSuggestions(table).length > 0" class="dashboard-suggestions" aria-label="Dashboard suggestions">
            <h3>What You Can Analyze</h3>
            <ul>
              <li v-for="suggestion in getDashboardSuggestions(table)" :key="suggestion.type">
                <strong>{{ suggestion.type }}:</strong> {{ suggestion.description }}
              </li>
            </ul>
          </aside>

          <div class="table-wrap">
            <table :aria-label="selectedTables[0]?.id === table.id ? 'Field definitions' : `${tableDisplayName(table)} fields`">
              <thead>
                <tr>
                  <th scope="col">Field Name</th>
                  <th scope="col">Data Type</th>
                  <th scope="col">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in table.fields" :key="field.name">
                  <th scope="row">
                    <span>{{ field.description || field.name }}</span>
                    <small v-if="field.description && field.description !== field.name" class="field-technical-name">{{ field.name }}</small>
                  </th>
                  <td><span class="type-badge">{{ field.type }}</span></td>
                  <td>
                    <div
                      v-if="field.dictionaryDescription"
                      class="markdown-content"
                      v-html="renderMarkdown(field.dictionaryDescription)"
                    ></div>
                    <span v-else class="muted">No description</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  </section>
</template>
