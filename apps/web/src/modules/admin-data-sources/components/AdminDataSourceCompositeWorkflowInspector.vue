<script setup lang="ts">
import { computed } from 'vue';
import type { AdminDataSource, AdminDataSourceTable } from '../types';
import { tableDisplayName } from '../view-model';
import type { CompositeSegmentDraft } from './admin-data-source-composite-workflow-types';

const props = defineProps<{
  continueOnError: boolean;
  dataSources: AdminDataSource[];
  dedupeBy: string;
  rawPreview: string;
  selectedNodeId: string;
  selectedSegment: CompositeSegmentDraft | null;
  segmentCount: number;
  sortBy: string;
  sortDirection: string;
  source: AdminDataSource | null;
  table: AdminDataSourceTable | null;
}>();

const emit = defineEmits<{
  duplicateSegment: [];
  removeSegment: [];
  updateSegment: [patch: Partial<CompositeSegmentDraft>];
  'update:continueOnError': [value: boolean];
  'update:dedupeBy': [value: string];
  'update:sortBy': [value: string];
  'update:sortDirection': [value: string];
}>();

const selectedDataSourceTables = computed(() => {
  if (!props.selectedSegment?.dataSourceId) return [];
  return props.dataSources.find(source => source.id === props.selectedSegment?.dataSourceId)?.tables ?? [];
});

function eventValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}

function checkedValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}
</script>

<template>
  <aside class="admin-ds-composite-inspector" aria-label="Selected workflow node">
    <template v-if="selectedSegment">
      <div class="admin-ds-composite-inspector-head">
        <div>
          <p class="admin-modal-eyebrow">Source segment</p>
          <h3>{{ selectedSegment.name || 'Source segment' }}</h3>
        </div>
        <div class="admin-ds-composite-inline-actions">
          <button class="admin-secondary-button" type="button" @click="emit('duplicateSegment')">Duplicate</button>
          <button class="admin-danger-button" type="button" @click="emit('removeSegment')">Remove</button>
        </div>
      </div>
      <label>
        <span>Component ID</span>
        <input :value="selectedSegment.id" type="text" @input="emit('updateSegment', { id: eventValue($event) })" />
      </label>
      <label>
        <span>Name</span>
        <input :value="selectedSegment.name" type="text" @input="emit('updateSegment', { name: eventValue($event) })" />
      </label>
      <label>
        <span>Data Source</span>
        <select :value="selectedSegment.dataSourceId" @change="emit('updateSegment', { dataSourceId: eventValue($event), tableName: '' })">
          <option value="">Select data source...</option>
          <option v-for="dataSource in dataSources" :key="dataSource.id" :value="dataSource.id">
            {{ dataSource.name }} ({{ dataSource.type }})
          </option>
        </select>
      </label>
      <label>
        <span>Table / Data Model</span>
        <select :value="selectedSegment.tableName" @change="emit('updateSegment', { tableName: eventValue($event) })">
          <option value="">Use custom query only</option>
          <option v-for="dataSourceTable in selectedDataSourceTables" :key="dataSourceTable.id" :value="dataSourceTable.name">
            {{ tableDisplayName(dataSourceTable) }} ({{ dataSourceTable.name }})
          </option>
        </select>
      </label>
      <label>
        <span>Applies To</span>
        <select :value="selectedSegment.when" @change="emit('updateSegment', { when: eventValue($event) })">
          <option value="always">Always</option>
          <option value="history">Historical range before today trading start</option>
          <option value="current">Current range from today trading start</option>
        </select>
      </label>
      <label>
        <span>Condition</span>
        <input
          :value="selectedSegment.condition"
          type="text"
          placeholder="CategoryId != -1"
          @input="emit('updateSegment', { condition: eventValue($event) })"
        />
      </label>
      <label>
        <span>Query</span>
        <textarea
          :value="selectedSegment.query"
          rows="7"
          spellcheck="false"
          placeholder="select * from source_table where created_on >= {{segmentStartDate}} and created_on < {{segmentEndDate}}"
          @input="emit('updateSegment', { query: eventValue($event) })"
        ></textarea>
      </label>
      <div class="admin-data-source-form-grid">
        <label>
          <span>Field Map JSON</span>
          <textarea
            :value="selectedSegment.fieldMap"
            rows="5"
            spellcheck="false"
            placeholder='{"created_on":"CreatedOn","invoice_discount":"InvoiceDiscount"}'
            @input="emit('updateSegment', { fieldMap: eventValue($event) })"
          ></textarea>
        </label>
        <label>
          <span>Parameters JSON</span>
          <textarea
            :value="selectedSegment.parameterValues"
            rows="5"
            spellcheck="false"
            placeholder='{"companyId":"{{clientId}}"}'
            @input="emit('updateSegment', { parameterValues: eventValue($event) })"
          ></textarea>
        </label>
      </div>
      <div class="admin-data-source-form-grid">
        <label>
          <span>Source Label Field</span>
          <input :value="selectedSegment.sourceLabelField" type="text" placeholder="SourceSystem" @input="emit('updateSegment', { sourceLabelField: eventValue($event) })" />
        </label>
        <label>
          <span>Timeout (ms)</span>
          <input :value="selectedSegment.timeoutMs" inputmode="numeric" type="text" placeholder="45000" @input="emit('updateSegment', { timeoutMs: eventValue($event) })" />
        </label>
      </div>
    </template>

    <template v-else-if="selectedNodeId === 'merge-output'">
      <p class="admin-modal-eyebrow">Merge rows</p>
      <h3>Parallel merge settings</h3>
      <div class="admin-data-source-form-grid">
        <label>
          <span>Sort By</span>
          <input :value="sortBy" type="text" placeholder="CreatedOn" @input="emit('update:sortBy', eventValue($event))" />
        </label>
        <label>
          <span>Sort Direction</span>
          <select :value="sortDirection" @change="emit('update:sortDirection', eventValue($event))">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>
      <label>
        <span>Dedupe Fields</span>
        <input :value="dedupeBy" type="text" placeholder="CompanyId, CreatedOn" @input="emit('update:dedupeBy', eventValue($event))" />
      </label>
      <label class="admin-ds-composite-check-row">
        <input :checked="continueOnError" type="checkbox" @change="emit('update:continueOnError', checkedValue($event))" />
        <span>Continue if one optional segment fails</span>
      </label>
      <pre class="admin-ds-composite-json-preview">{{ rawPreview }}</pre>
    </template>

    <template v-else-if="selectedNodeId === 'output-table'">
      <p class="admin-modal-eyebrow">Output</p>
      <h3>{{ table ? tableDisplayName(table) : 'API data model' }}</h3>
      <p class="admin-muted">
        Saving this workflow updates the selected API endpoint. Existing dashboard components keep using the same data model and receive the merged rows at runtime.
      </p>
      <dl class="admin-ds-composite-output-summary">
        <div><dt>Data source</dt><dd>{{ source?.name || '-' }}</dd></div>
        <div><dt>Table</dt><dd>{{ table?.name || '-' }}</dd></div>
        <div><dt>Segments</dt><dd>{{ segmentCount }}</dd></div>
      </dl>
    </template>

    <template v-else>
      <p class="admin-modal-eyebrow">Runtime parameters</p>
      <h3>Parameters available to every node</h3>
      <p class="admin-muted">
        Dashboard filters, embed access context, default values, and date helpers are passed into each source query. Use placeholders such as
        &#123;&#123;clientId&#125;&#125;, &#123;&#123;locationIds&#125;&#125;, &#123;&#123;fromDate&#125;&#125;, &#123;&#123;segmentStartDate&#125;&#125;, and &#123;&#123;todayTradingStart&#125;&#125;.
      </p>
      <div class="admin-ds-composite-token-grid">
        <span>clientId</span>
        <span>locationIds</span>
        <span>fromDate</span>
        <span>toDate</span>
        <span>segmentStartDate</span>
        <span>segmentEndDate</span>
        <span>todayTradingStart</span>
        <span>rangeType</span>
      </div>
    </template>
  </aside>
</template>
