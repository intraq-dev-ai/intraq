<script setup lang="ts">
import { computed } from 'vue';
import type { AdminDataSourceFormState } from '../types';
import { ADMIN_DATA_SOURCE_TYPE_OPTIONS } from '../source-options';
import AdminDataSourceApiWorkflowFields from './AdminDataSourceApiWorkflowFields.vue';

const props = defineProps<{
  connectionTypeName: string;
  isSaving: boolean;
  mode: 'create' | 'edit';
  modelValue: AdminDataSourceFormState;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [];
  'update:modelValue': [value: AdminDataSourceFormState];
}>();

const sourceTypes = ADMIN_DATA_SOURCE_TYPE_OPTIONS;

const dialogTitle = computed(() => (
  props.mode === 'create'
    ? `Add New ${props.connectionTypeName} Connection`
    : `Edit ${props.connectionTypeName} Connection`
));
const isApiSource = computed(() => props.modelValue.type === 'api');
const isDatabricksSource = computed(() => props.modelValue.type === 'databricks');
const isFlatFileSource = computed(() => props.modelValue.type === 'file' || props.modelValue.type === 'flatfile');
const isS3Source = computed(() => props.modelValue.type === 's3');
const isDatabaseSource = computed(() =>
  !isApiSource.value
  && !isDatabricksSource.value
  && !isFlatFileSource.value
  && !isS3Source.value
);
function updateField(key: keyof AdminDataSourceFormState, value: string | boolean): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}

function replaceModel(value: AdminDataSourceFormState): void {
  emit('update:modelValue', value);
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : '';
}

function checkedValue(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

</script>

<template>
  <div v-if="open" class="admin-modal-overlay" role="presentation" @click.self="$emit('close')">
    <section
      class="admin-modal admin-data-source-dialog"
      :class="{ 'admin-data-source-dialog--api-workflow': isApiSource }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${mode}-data-source-dialog-title`"
      tabindex="-1"
      @keydown.esc="$emit('close')"
      @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()"
    >
      <form class="admin-form" :aria-label="dialogTitle" @submit.prevent="$emit('submit')">
        <header class="admin-modal-header">
          <div>
            <p class="admin-modal-eyebrow">Data source</p>
            <h2 :id="`${mode}-data-source-dialog-title`">{{ dialogTitle }}</h2>
          </div>
          <button class="admin-icon-button" type="button" aria-label="Close data source dialog" @click="$emit('close')">x</button>
        </header>

        <div class="admin-data-source-form-grid">
          <label>
            <span>Connection Name *</span>
            <input
              :value="modelValue.name"
              required
              type="text"
              autocomplete="off"
              @input="updateField('name', inputValue($event))"
            />
          </label>

          <label>
            <span>Type *</span>
            <select :value="modelValue.type" required @change="updateField('type', inputValue($event))">
              <option v-for="sourceType in sourceTypes" :key="sourceType.value" :value="sourceType.value">
                {{ sourceType.label }}
              </option>
            </select>
          </label>
          <label>
            <span>Source Type *</span>
            <select
              aria-label="Connection role"
              :value="modelValue.sourceType"
              required
              @change="updateField('sourceType', inputValue($event))"
            >
              <option value="source">Source (Read Data)</option>
              <option value="target">Target (Write Data)</option>
            </select>
          </label>
          <label>
            <span>Currency</span>
            <select :value="modelValue.currencySymbol" @change="updateField('currencySymbol', inputValue($event))">
              <option value="$">$ (USD/AUD)</option>
              <option value="Rs">Rs (NPR)</option>
              <option value="€">EUR</option>
              <option value="£">GBP</option>
            </select>
          </label>
        </div>

        <label>
          <span>Description</span>
          <textarea
            :value="modelValue.description"
            rows="3"
            @input="updateField('description', inputValue($event))"
          ></textarea>
        </label>

        <fieldset v-if="isDatabricksSource" class="admin-data-source-fieldset">
          <legend>Databricks SQL Warehouse</legend>
          <div class="admin-data-source-form-grid">
            <label>
              <span>Server Hostname *</span>
              <input
                :value="modelValue.databricksServerHostname"
                required
                type="text"
                autocomplete="off"
                placeholder="dbc-12345678-1234.cloud.databricks.com"
                @input="updateField('databricksServerHostname', inputValue($event))"
              />
            </label>
            <label>
              <span>HTTP Path *</span>
              <input
                :value="modelValue.databricksHttpPath"
                required
                type="text"
                autocomplete="off"
                placeholder="/sql/1.0/warehouses/abcd1234efgh5678"
                @input="updateField('databricksHttpPath', inputValue($event))"
              />
            </label>
            <label>
              <span>Catalog</span>
              <input
                :value="modelValue.databricksCatalog"
                type="text"
                autocomplete="off"
                placeholder="hive_metastore"
                @input="updateField('databricksCatalog', inputValue($event))"
              />
            </label>
            <label>
              <span>Schema</span>
              <input
                :value="modelValue.databricksSchema"
                type="text"
                autocomplete="off"
                placeholder="default"
                @input="updateField('databricksSchema', inputValue($event))"
              />
            </label>
            <label>
              <span>Query Timeout (ms)</span>
              <input
                :value="modelValue.requestTimeoutMs"
                inputmode="numeric"
                type="text"
                autocomplete="off"
                placeholder="120000"
                @input="updateField('requestTimeoutMs', inputValue($event))"
              />
            </label>
            <label>
              <span>Access Token *</span>
              <input
                :value="modelValue.databricksAccessToken"
                :required="mode === 'create'"
                type="password"
                autocomplete="new-password"
                placeholder="Enter token to save or rotate"
                @input="updateField('databricksAccessToken', inputValue($event))"
              />
            </label>
          </div>
        </fieldset>

        <fieldset v-else-if="isDatabaseSource" class="admin-data-source-fieldset">
          <legend>Connection</legend>
          <div class="admin-data-source-form-grid">
            <label>
              <span>Host</span>
              <input :value="modelValue.host" type="text" autocomplete="off" @input="updateField('host', inputValue($event))" />
            </label>
            <label>
              <span>Port</span>
              <input :value="modelValue.port" inputmode="numeric" type="text" autocomplete="off" @input="updateField('port', inputValue($event))" />
            </label>
            <label>
              <span>Database</span>
              <input :value="modelValue.database" type="text" autocomplete="off" @input="updateField('database', inputValue($event))" />
            </label>
            <label>
              <span>Query Timeout (ms)</span>
              <input :value="modelValue.requestTimeoutMs" inputmode="numeric" type="text" autocomplete="off" placeholder="15000" @input="updateField('requestTimeoutMs', inputValue($event))" />
            </label>
            <label>
              <span>Username</span>
              <input :value="modelValue.username" type="text" autocomplete="username" @input="updateField('username', inputValue($event))" />
            </label>
            <label>
              <span>Password</span>
              <input :value="modelValue.password" type="password" autocomplete="new-password" @input="updateField('password', inputValue($event))" />
            </label>
          </div>
          <div class="admin-data-source-form-grid">
            <label class="admin-check-row">
              <input :checked="modelValue.databaseSsl" type="checkbox" @change="updateField('databaseSsl', checkedValue($event))" />
              <span>Use SSL/TLS for this database connection</span>
            </label>
            <label class="admin-check-row">
              <input
                :checked="modelValue.databaseSslRejectUnauthorized"
                :disabled="!modelValue.databaseSsl"
                type="checkbox"
                @change="updateField('databaseSslRejectUnauthorized', checkedValue($event))"
              />
              <span>Verify database TLS certificate</span>
            </label>
          </div>
          <label>
            <span>API URL</span>
            <input :value="modelValue.apiUrl" type="url" autocomplete="off" @input="updateField('apiUrl', inputValue($event))" />
          </label>
        </fieldset>

        <fieldset v-else-if="isS3Source" class="admin-data-source-fieldset">
          <legend>S3 Source</legend>
          <div class="admin-data-source-form-grid">
            <label>
              <span>Bucket Name *</span>
              <input :value="modelValue.bucket" required type="text" autocomplete="off" @input="updateField('bucket', inputValue($event))" />
            </label>
            <label>
              <span>Region *</span>
              <input :value="modelValue.region" required type="text" autocomplete="off" placeholder="ap-southeast-2" @input="updateField('region', inputValue($event))" />
            </label>
            <label>
              <span>Access Key ID</span>
              <input :value="modelValue.apiAuthValue" type="text" autocomplete="off" @input="updateField('apiAuthValue', inputValue($event))" />
            </label>
            <label>
              <span>Secret Access Key</span>
              <input :value="modelValue.secretAccessKey" type="password" autocomplete="new-password" @input="updateField('secretAccessKey', inputValue($event))" />
            </label>
          </div>
        </fieldset>

        <AdminDataSourceApiWorkflowFields
          v-else-if="isApiSource"
          :model-value="modelValue"
          @replace-model="replaceModel"
          @update-field="updateField"
        />

        <fieldset v-else-if="isFlatFileSource" class="admin-data-source-fieldset">
          <legend>Flat File Source</legend>
          <div class="admin-data-source-form-grid">
            <label>
              <span>File Type *</span>
              <select :value="modelValue.fileFormat" required @change="updateField('fileFormat', inputValue($event))">
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
              </select>
            </label>
            <label>
              <span>Existing R2 Path</span>
              <input :value="modelValue.filePath" type="text" autocomplete="off" placeholder="r2://bucket/prefix/file.csv" @input="updateField('filePath', inputValue($event))" />
            </label>
          </div>
        </fieldset>

        <fieldset class="admin-data-source-fieldset">
          <legend>Availability</legend>
          <label class="admin-check-row">
            <input
              :checked="modelValue.dashboardVisible"
              type="checkbox"
              @change="updateField('dashboardVisible', checkedValue($event))"
            />
            <span>Show in dashboards and Analyzer</span>
          </label>
          <label class="admin-check-row">
            <input
              :checked="modelValue.dashboardDefault"
              :disabled="!modelValue.dashboardVisible"
              type="checkbox"
              @change="updateField('dashboardDefault', checkedValue($event))"
            />
            <span>Use as default dashboard source</span>
          </label>
          <label class="admin-check-row">
            <input
              :checked="modelValue.isGloballyVisible"
              type="checkbox"
              @change="updateField('isGloballyVisible', checkedValue($event))"
            />
            <span>Globally visible sample source</span>
          </label>
        </fieldset>

        <footer class="admin-modal-footer">
          <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="$emit('close')">Cancel</button>
          <button class="button" type="submit" :disabled="isSaving || !modelValue.name.trim()">
            {{ isSaving ? 'Saving' : mode === 'create' ? 'Save Data Source' : 'Update Data Source' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>
