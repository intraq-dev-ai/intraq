<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { requestAdmin } from '../api';
import { toDisplayText } from '../format';
import type { AdminRecord, AdminResourceSurface } from '../types';
import { useToast } from '../../shared/use-toast';
import '../admin-smtp-configuration.css';
import '../admin-smtp-configuration-modal.css';

type DialogMode = 'create' | 'edit';

interface SmtpForm {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  bccEmail: string;
  isActive: boolean;
  isDefault: boolean;
}

const props = defineProps<{ surface: AdminResourceSurface }>();

const configurations = ref<AdminRecord[]>([]);
const dialogMode = ref<DialogMode | null>(null);
const editingRecord = ref<AdminRecord | null>(null);
const testingRecord = ref<AdminRecord | null>(null);
const testEmail = ref('');
const form = ref(defaultForm());
const status = ref('Loading SMTP configurations');
const error = ref('');
const modalError = ref('');
const isLoading = ref(false);
const isSaving = ref(false);
const testingId = ref('');
const toast = useToast();

const modalTitle = computed(() => dialogMode.value === 'edit' ? 'Edit SMTP Configuration' : 'Add SMTP Configuration');
const isDialogOpen = computed(() => dialogMode.value !== null);
const configDialogEl = ref<HTMLElement | null>(null);
const testDialogEl = ref<HTMLElement | null>(null);

watch(() => props.surface.id, () => {
  closeConfigDialog();
  closeTestDialog();
  void loadConfigurations();
}, { immediate: true });

watch(isDialogOpen, (open) => { if (open) void nextTick(() => configDialogEl.value?.focus()); });
watch(() => testingRecord.value, (val) => { if (val) void nextTick(() => testDialogEl.value?.focus()); });

async function loadConfigurations(): Promise<void> {
  isLoading.value = true;
  error.value = '';
  status.value = 'Loading SMTP configurations';
  try {
    configurations.value = extractRecords(await requestAdmin<unknown>(props.surface.path));
    status.value = `${configurations.value.length} ${pluralize('configuration', configurations.value.length)} loaded`;
  } catch (caught) {
    configurations.value = [];
    error.value = caught instanceof Error && caught.message ? caught.message : 'Failed to load SMTP configurations';
    toast.error(error.value);
    status.value = 'SMTP configurations failed';
  } finally {
    isLoading.value = false;
  }
}

function openCreateDialog(): void {
  form.value = defaultForm();
  editingRecord.value = null;
  modalError.value = '';
  dialogMode.value = 'create';
}

function openEditDialog(record: AdminRecord): void {
  form.value = formFromRecord(record);
  editingRecord.value = record;
  modalError.value = '';
  dialogMode.value = 'edit';
}

function closeConfigDialog(): void {
  dialogMode.value = null;
  editingRecord.value = null;
  modalError.value = '';
}

async function submitConfiguration(): Promise<void> {
  await runModalSaving(async () => {
    const body = formPayload();
    const message = dialogMode.value === 'edit' ? 'SMTP configuration updated' : 'SMTP configuration created';
    if (dialogMode.value === 'edit' && editingRecord.value) {
      await requestAdmin<unknown>(`${props.surface.path}/${encodeURIComponent(recordId(editingRecord.value))}`, { method: 'PUT', body });
    } else {
      await requestAdmin<unknown>(props.surface.path, { method: 'POST', body });
    }
    closeConfigDialog();
    await loadConfigurations();
    toast.success(message);
    status.value = message;
  });
}

function openTestDialog(record: AdminRecord): void {
  testingRecord.value = record;
  testEmail.value = toDisplayText(record.replyToEmail, '') || toDisplayText(record.fromEmail, '') || toDisplayText(record.username, '');
  modalError.value = '';
}

function closeTestDialog(): void {
  testingRecord.value = null;
  testEmail.value = '';
  modalError.value = '';
}

async function submitTest(): Promise<void> {
  const record = testingRecord.value;
  const recipient = testEmail.value.trim();
  if (!record || !recipient) return;
  testingId.value = recordId(record);
  await runModalSaving(async () => {
    const result = await requestAdmin<unknown>(`${props.surface.path}/${encodeURIComponent(recordId(record))}/test`, {
      method: 'POST',
      body: { testEmail: recipient }
    });
    const message = resultMessage(result) ?? `Test email sent to ${recipient}`;
    replaceConfiguration(resultConfiguration(result) ?? {
      ...record,
      testStatus: 'success',
      testError: '',
      lastTested: new Date().toISOString()
    });
    closeTestDialog();
    toast.success(message);
    status.value = message;
  });
  testingId.value = '';
}

async function setAsDefault(record: AdminRecord): Promise<void> {
  await runPageSaving('Set default SMTP completed', async () => {
    await requestAdmin<unknown>(`${props.surface.path}/${encodeURIComponent(recordId(record))}/set-default`, { method: 'POST' });
    await loadConfigurations();
  });
}

async function deleteConfiguration(record: AdminRecord): Promise<void> {
  await runPageSaving('SMTP configuration deleted', async () => {
    await requestAdmin<unknown>(`${props.surface.path}/${encodeURIComponent(recordId(record))}`, { method: 'DELETE' });
    await loadConfigurations();
  });
}

async function runPageSaving(message: string, action: () => Promise<void>): Promise<void> {
  isSaving.value = true;
  error.value = '';
  try {
    await action();
    toast.success(message);
    status.value = message;
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : 'SMTP action failed';
    toast.error(error.value);
    status.value = 'SMTP action failed';
  } finally {
    isSaving.value = false;
  }
}

async function runModalSaving(action: () => Promise<void>): Promise<void> {
  isSaving.value = true;
  modalError.value = '';
  try {
    await action();
  } catch (caught) {
    modalError.value = caught instanceof Error && caught.message ? caught.message : 'SMTP action failed';
    toast.error(modalError.value);
    status.value = 'SMTP action failed';
  } finally {
    isSaving.value = false;
  }
}

function defaultForm(): SmtpForm {
  return { name: '', host: '', port: 587, secure: false, username: '', password: '', fromName: '', fromEmail: '', replyToEmail: '', bccEmail: '', isActive: true, isDefault: false };
}

function formFromRecord(record: AdminRecord): SmtpForm {
  return {
    name: toDisplayText(record.name, ''),
    host: toDisplayText(record.host, ''),
    port: numberValue(record.port, 587),
    secure: Boolean(record.secure),
    username: toDisplayText(record.username, ''),
    password: '',
    fromName: toDisplayText(record.fromName, ''),
    fromEmail: toDisplayText(record.fromEmail, ''),
    replyToEmail: toDisplayText(record.replyToEmail, ''),
    bccEmail: toDisplayText(record.bccEmail, ''),
    isActive: record.isActive !== false,
    isDefault: Boolean(record.isDefault)
  };
}

function formPayload(): Record<string, unknown> {
  const name = form.value.name.trim() || `${form.value.host.trim()}:${form.value.port}`;
  return Object.fromEntries(Object.entries({ ...form.value, name }).filter(([, value]) => value !== ''));
}

function recordId(record: AdminRecord): string {
  return toDisplayText(record.id, '');
}

function cardTitle(record: AdminRecord): string {
  if (record.isCredentialsHidden) return 'Global SMTP (Hidden)';
  return `${toDisplayText(record.host, 'smtp host')}:${toDisplayText(record.port, '587')}`;
}

function cardName(record: AdminRecord): string {
  return toDisplayText(record.name, cardTitle(record));
}

function tenantName(record: AdminRecord): string {
  return isRecord(record.tenant) ? toDisplayText(record.tenant.name, '') : '';
}

function testStatus(record: AdminRecord): string {
  return toDisplayText(record.testStatus, '');
}

function testStatusLabel(record: AdminRecord): string {
  const value = testStatus(record);
  if (value === 'success') return 'Tested';
  if (value === 'failed') return 'Failed';
  return value ? 'Testing' : '';
}

function formatDate(value: unknown): string {
  if (!value) return 'Never';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return toDisplayText(value, 'Never');
  return date.toLocaleString();
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function replaceConfiguration(config: AdminRecord): void {
  const id = recordId(config);
  configurations.value = configurations.value.map(item => recordId(item) === id ? config : item);
}

function resultMessage(value: unknown): string | null {
  return isRecord(value) && typeof value.message === 'string' ? value.message : null;
}

function resultConfiguration(value: unknown): AdminRecord | null {
  return isRecord(value) && isRecord(value.configuration) ? value.configuration : null;
}

function extractRecords(payload: unknown): AdminRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function isRecord(value: unknown): value is AdminRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
</script>

<template>
  <section class="smtp-configuration" :aria-labelledby="`${surface.id}-title`">
    <header class="header-section">
      <div class="smtp-header-row">
        <div>
          <h1 :id="`${surface.id}-title`">SMTP Configuration</h1>
          <p>{{ surface.description }}</p>
        </div>
        <button class="smtp-primary-button" type="button" @click="openCreateDialog">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m6-6H6" />
          </svg>
          Add SMTP Configuration
        </button>
      </div>
    </header>

    <p class="sr-only" role="status" aria-label="SMTP Configuration status" aria-live="polite">{{ status }}</p>

    <div v-if="isLoading" class="smtp-loading">
      <span aria-hidden="true"></span>
    </div>
    <article v-else-if="error" class="smtp-error" role="alert">
      <strong>Error</strong>
      <p>{{ error }}</p>
    </article>
    <div v-else class="smtp-list">
      <article v-if="configurations.length === 0" class="smtp-empty">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
        </svg>
        <h2>No SMTP configurations</h2>
        <p>Get started by creating your first SMTP configuration.</p>
        <button class="smtp-primary-button" type="button" @click="openCreateDialog">Add SMTP Configuration</button>
      </article>

      <template v-else>
        <article v-for="config in configurations" :key="recordId(config)" class="smtp-card">
          <div class="smtp-card-content">
            <div class="smtp-card-main">
              <div class="smtp-card-title-row">
                <h2>{{ cardTitle(config) }}</h2>
                <span :class="['smtp-badge', config.isGlobal ? 'global' : 'tenant']">{{ config.isGlobal ? 'Global' : 'Tenant' }}</span>
                <span v-if="tenantName(config)" class="smtp-badge neutral">{{ tenantName(config) }}</span>
                <span v-if="config.isDefault" class="smtp-badge default">Default</span>
                <span :class="['smtp-badge', config.isActive === false ? 'inactive' : 'active']">{{ config.isActive === false ? 'Inactive' : 'Active' }}</span>
                <span v-if="testStatusLabel(config)" :class="['smtp-badge', `test-${testStatus(config)}`]">{{ testStatusLabel(config) }}</span>
              </div>

              <dl class="smtp-detail-grid">
                <div><dt>Username:</dt><dd>{{ toDisplayText(config.username) }}</dd></div>
                <div><dt>From Email:</dt><dd>{{ toDisplayText(config.fromEmail) }}</dd></div>
                <div><dt>From Name:</dt><dd>{{ toDisplayText(config.fromName) }}</dd></div>
                <div><dt>Security:</dt><dd>{{ config.secure ? 'SSL/TLS' : 'STARTTLS' }}</dd></div>
                <div v-if="config.replyToEmail"><dt>Reply To:</dt><dd>{{ toDisplayText(config.replyToEmail) }}</dd></div>
                <div v-if="config.bccEmail"><dt>BCC:</dt><dd>{{ toDisplayText(config.bccEmail) }}</dd></div>
                <div v-if="config.lastTested"><dt>Last Tested:</dt><dd>{{ formatDate(config.lastTested) }}</dd></div>
              </dl>
              <p v-if="config.testError" class="smtp-test-error"><strong>Test Error:</strong> {{ toDisplayText(config.testError) }}</p>
            </div>

            <div class="smtp-card-actions">
              <template v-if="!config.isCredentialsHidden">
                <button class="smtp-action-button test" type="button" :disabled="testingId === recordId(config)" :aria-label="`Test SMTP for ${cardName(config)}`" @click="openTestDialog(config)">Test</button>
                <button v-if="!config.isDefault" class="smtp-action-button default" type="button" :disabled="isSaving" :aria-label="`Set default SMTP for ${cardName(config)}`" @click="setAsDefault(config)">Set Default</button>
              </template>
              <span v-else class="smtp-readonly">Read Only</span>
              <button class="smtp-action-button neutral" type="button" :aria-label="`Edit SMTP for ${cardName(config)}`" @click="openEditDialog(config)">Edit</button>
              <button class="smtp-action-button danger" type="button" :disabled="isSaving" :aria-label="`Delete SMTP for ${cardName(config)}`" @click="deleteConfiguration(config)">Delete</button>
            </div>
          </div>
        </article>
      </template>
    </div>

    <div v-if="isDialogOpen" class="smtp-modal-overlay" role="presentation" @click.self="closeConfigDialog">
      <section ref="configDialogEl" class="smtp-modal large" role="dialog" aria-modal="true" :aria-labelledby="`${surface.id}-config-dialog-title`" tabindex="-1" @keydown.esc="closeConfigDialog">
        <header class="smtp-modal-header">
          <h2 :id="`${surface.id}-config-dialog-title`">{{ modalTitle }}</h2>
          <button type="button" aria-label="Close SMTP configuration dialog" @click="closeConfigDialog">x</button>
        </header>
        <form class="smtp-modal-body" :aria-label="modalTitle" @submit.prevent="submitConfiguration">
          <fieldset>
            <legend>Server Settings</legend>
            <label>SMTP Host *<input v-model="form.host" required placeholder="smtp.gmail.com" /></label>
            <label>Port *<input v-model.number="form.port" required type="number" placeholder="587" /></label>
            <label class="smtp-checkbox"><input v-model="form.secure" type="checkbox" /> Use SSL/TLS (check for port 465, uncheck for port 587/25)</label>
          </fieldset>
          <fieldset>
            <legend>Authentication</legend>
            <label>Username *<input v-model="form.username" required placeholder="your-email@gmail.com" /></label>
            <label>Password *<input v-model="form.password" :required="dialogMode === 'create'" type="password" :placeholder="dialogMode === 'edit' ? 'Leave blank to keep current password' : 'Your app password'" /></label>
          </fieldset>
          <fieldset>
            <legend>Email Settings</legend>
            <label>From Name *<input v-model="form.fromName" required placeholder="Support" /></label>
            <label>From Email *<input v-model="form.fromEmail" required type="email" placeholder="support@yourcompany.com" /></label>
            <label>Reply To Email<input v-model="form.replyToEmail" type="email" placeholder="noreply@yourcompany.com" /></label>
            <label>BCC Email<input v-model="form.bccEmail" type="email" placeholder="admin@yourcompany.com" /></label>
          </fieldset>
          <fieldset>
            <legend>Configuration Options</legend>
            <label class="smtp-checkbox"><input v-model="form.isActive" type="checkbox" /> Active (enable this configuration for sending emails)</label>
            <label class="smtp-checkbox"><input v-model="form.isDefault" type="checkbox" /> Set as default configuration</label>
          </fieldset>
          <p v-if="modalError" class="smtp-error compact" role="alert">{{ modalError }}</p>
          <footer class="smtp-modal-footer">
            <button class="smtp-secondary-button" type="button" @click="closeConfigDialog">Cancel</button>
            <button class="smtp-primary-button" type="submit" :disabled="isSaving">{{ isSaving ? 'Saving...' : (dialogMode === 'edit' ? 'Update Configuration' : 'Create Configuration') }}</button>
          </footer>
        </form>
      </section>
    </div>

    <div v-if="testingRecord" class="smtp-modal-overlay" role="presentation" @click.self="closeTestDialog">
      <section ref="testDialogEl" class="smtp-modal" role="dialog" aria-modal="true" aria-labelledby="smtp-test-dialog-title" tabindex="-1" @keydown.esc="closeTestDialog">
        <header class="smtp-modal-header">
          <h2 id="smtp-test-dialog-title">Test SMTP Configuration</h2>
          <button type="button" aria-label="Close test SMTP dialog" @click="closeTestDialog">x</button>
        </header>
        <form class="smtp-modal-body" aria-label="Test SMTP Configuration" @submit.prevent="submitTest">
          <p>Send a test email to verify that your SMTP configuration is working correctly.</p>
          <article class="smtp-test-details">
            <strong>Configuration Details:</strong>
            <span>Host: {{ toDisplayText(testingRecord.host) }}:{{ toDisplayText(testingRecord.port) }}</span>
            <span>Username: {{ toDisplayText(testingRecord.username) }}</span>
            <span>From: {{ toDisplayText(testingRecord.fromName) }} &lt;{{ toDisplayText(testingRecord.fromEmail) }}&gt;</span>
            <span>Security: {{ testingRecord.secure ? 'SSL/TLS' : 'STARTTLS' }}</span>
          </article>
          <label>Test Email Address *<input v-model="testEmail" required type="email" placeholder="test@example.com" /></label>
          <p v-if="modalError" class="smtp-error compact" role="alert">{{ modalError }}</p>
          <footer class="smtp-modal-footer">
            <button class="smtp-secondary-button" type="button" @click="closeTestDialog">Cancel</button>
            <button class="smtp-primary-button" type="submit" :disabled="isSaving || !testEmail.trim()">{{ isSaving ? 'Sending Test Email...' : 'Send Test Email' }}</button>
          </footer>
        </form>
      </section>
    </div>
  </section>
</template>
