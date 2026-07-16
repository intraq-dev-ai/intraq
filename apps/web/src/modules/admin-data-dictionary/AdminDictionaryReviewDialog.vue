<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AdminDictionaryField, AdminDictionaryTableDetails } from './types';
import type { AdminDictionaryTableRow } from './view-model';

defineProps<{
  fields: AdminDictionaryField[];
  loading: boolean;
  row: AdminDictionaryTableRow | null;
  show: boolean;
  tableDetails: AdminDictionaryTableDetails | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const dialogEl = ref<HTMLElement | null>(null);
onMounted(() => { dialogEl.value?.focus(); });
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="admin-dictionary-dialog-backdrop" @click.self="emit('close')">
      <section
        ref="dialogEl"
        class="admin-dictionary-dialog admin-dictionary-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dictionary-review-title"
        tabindex="-1"
        @keydown.esc="emit('close')"
      >
        <header class="admin-dictionary-dialog-header">
          <div>
            <p class="eyebrow">Dictionary Review</p>
            <h2 id="admin-dictionary-review-title">
              {{ tableDetails?.businessName ?? row?.name ?? 'Table dictionary' }}
            </h2>
            <p v-if="row">{{ row.dataSourceName }} / {{ row.physicalName }}</p>
          </div>
          <button class="admin-icon-button" type="button" aria-label="Close dictionary review" @click="emit('close')">X</button>
        </header>

        <div class="admin-dictionary-dialog-body">
          <div v-if="!row" class="admin-empty-state">Select a table to review dictionary details.</div>
          <div v-else-if="loading" class="admin-empty-state" role="status" aria-live="polite">
            Loading dictionary review.
          </div>
          <template v-else>
            <section class="admin-dictionary-review-summary" aria-label="Selected table summary">
              <div>
                <span>Business context</span>
                <p>{{ tableDetails?.description ?? row.tableDescription ?? 'No dictionary description is available.' }}</p>
              </div>
              <div>
                <span>AI Metadata Center</span>
                <p>{{ row.hasDictionary ? 'Ready for AI metadata review.' : 'Dictionary definitions need review before AI metadata is complete.' }}</p>
              </div>
            </section>

            <div class="admin-table-wrap">
              <table aria-label="Dictionary review fields">
                <thead>
                  <tr>
                    <th scope="col">Field Name</th>
                    <th scope="col">Display Name</th>
                    <th scope="col">Data Type</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="field in fields" :key="field.name">
                    <th scope="row">{{ field.name }}</th>
                    <td>{{ field.label ?? field.name }}</td>
                    <td>{{ field.type }}</td>
                    <td>{{ field.dictionaryDescription || field.description || 'No description' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <footer class="admin-dictionary-dialog-footer">
          <span>{{ fields.length }} field{{ fields.length === 1 ? '' : 's' }}</span>
          <button class="button" type="button" @click="emit('close')">Done</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
