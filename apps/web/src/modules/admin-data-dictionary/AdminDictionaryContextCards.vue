<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { AdminDictionarySource } from './types';
import type { AdminDictionaryTableRow } from './view-model';

defineProps<{
  selectedRow: AdminDictionaryTableRow | null;
  selectedSource: AdminDictionarySource | null;
}>();

const emit = defineEmits<{
  review: [];
}>();
</script>

<template>
  <section class="admin-dictionary-context-grid" aria-label="Data dictionary context">
    <article class="panel admin-dictionary-context-card">
      <div>
        <p class="eyebrow">Data Source Dictionary</p>
        <h2>{{ selectedSource?.name ?? 'No data source selected' }}</h2>
        <p>
          {{ selectedSource?.description || 'Review source-level context, table definitions, field descriptions, and readiness before publishing to users.' }}
        </p>
      </div>
      <dl v-if="selectedSource" class="admin-dictionary-definition-list">
        <div>
          <dt>Source type</dt>
          <dd>{{ selectedRow?.sourceType ?? selectedSource.type }}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{{ selectedSource.status }}</dd>
        </div>
        <div>
          <dt>Tables</dt>
          <dd>{{ selectedSource.tables.length || selectedSource.tableCount }}</dd>
        </div>
      </dl>
    </article>

    <article class="panel admin-dictionary-context-card">
      <div>
        <p class="eyebrow">AI Metadata Center</p>
        <h2>{{ selectedRow ? selectedRow.name : 'Select a data model' }}</h2>
        <p>
          {{ selectedRow
            ? 'Review dictionary definitions, aliases, and value wording used by AI.'
            : 'Choose a table to inspect field definitions and AI metadata readiness.'
          }}
        </p>
      </div>
      <div class="admin-dictionary-context-actions">
        <button class="admin-secondary-button" type="button" :disabled="!selectedRow" @click="emit('review')">
          Review dictionary
        </button>
        <RouterLink
          v-if="selectedSource"
          class="admin-secondary-link"
          :to="{ path: '/admin/data-sources', query: { source: selectedSource.id } }"
        >
          Edit source
        </RouterLink>
      </div>
    </article>
  </section>
</template>
