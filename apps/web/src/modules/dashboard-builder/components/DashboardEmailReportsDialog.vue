<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  createDashboardEmailSubscription,
  deleteDashboardEmailSubscription,
  listDashboardEmailDeliveries,
  listDashboardEmailSubscriptions,
  parseDashboardEmailRecipients,
  sendDashboardEmailTest,
  updateDashboardEmailSubscription,
  type DashboardEmailDelivery,
  type DashboardEmailExportFormat,
  type DashboardEmailReportFrequency,
  type DashboardEmailSubscription
} from '../email-reports-api';
import '../layout/dashboard-email-reports-dialog.css';

const props = defineProps<{
  dashboardId: string;
  dashboardName?: string;
}>();

const emit = defineEmits<{
  close: [];
  created: [subscription: DashboardEmailSubscription];
  deleted: [subscriptionId: string];
  testSent: [subscription: DashboardEmailSubscription];
}>();

const dialogEl = ref<HTMLElement | null>(null);
onMounted(() => { dialogEl.value?.focus(); });

const subscriptions = ref<DashboardEmailSubscription[]>([]);
const deliveries = ref<DashboardEmailDelivery[]>([]);
const editingSubscriptionId = ref('');
const selectedSubscriptionId = ref('');
const subscriptionName = ref('');
const recipientsText = ref('');
const frequency = ref<DashboardEmailReportFrequency>('weekly');
const subject = ref('');
const enabled = ref(true);
const exportFormats = ref<DashboardEmailExportFormat[]>(['pdf']);
const includeIntraqInsights = ref(true);
const isLoading = ref(false);
const isCreating = ref(false);
const isLoadingDeliveries = ref(false);
const testingId = ref('');
const deletingId = ref('');
const deleteCandidateId = ref('');
const error = ref('');
const formError = ref('');
const status = ref('Email report subscriptions ready');

const selectedSubscription = computed(() => subscriptions.value.find(item => item.id === selectedSubscriptionId.value) ?? null);
const parsedRecipients = computed(() => parseDashboardEmailRecipients(recipientsText.value));
const canSubmit = computed(() => Boolean(props.dashboardId.trim() && subscriptionName.value.trim() && subject.value.trim() && parsedRecipients.value.length && exportFormats.value.length && !isCreating.value));

watch(() => props.dashboardName, name => {
  if (!subject.value.trim()) subject.value = defaultSubject(name);
}, { immediate: true });

watch(() => props.dashboardId, () => {
  selectedSubscriptionId.value = '';
  deliveries.value = [];
  resetForm();
  void loadSubscriptions();
}, { immediate: true });

async function loadSubscriptions(): Promise<void> {
  const dashboardId = props.dashboardId.trim();
  if (!dashboardId) {
    subscriptions.value = [];
    status.value = 'Select a dashboard before managing email reports';
    return;
  }
  isLoading.value = true;
  error.value = '';
  try {
    subscriptions.value = await listDashboardEmailSubscriptions(dashboardId);
    status.value = `${subscriptions.value.length} email ${subscriptions.value.length === 1 ? 'subscription' : 'subscriptions'} loaded`;
  } catch (caught) {
    subscriptions.value = [];
    error.value = readError(caught, 'Failed to load email subscriptions.');
    status.value = 'Email subscriptions failed to load';
  } finally {
    isLoading.value = false;
  }
}

async function submitSubscription(): Promise<void> {
  formError.value = '';
  const recipients = parsedRecipients.value;
  if (!recipients.length) {
    formError.value = 'Add at least one recipient.';
    return;
  }
  const trimmedSubject = subject.value.trim();
  const trimmedName = subscriptionName.value.trim();
  if (!trimmedName || !trimmedSubject) {
    formError.value = 'Add a subscription name and subject line.';
    return;
  }
  if (!exportFormats.value.length) {
    formError.value = 'Select at least one export format.';
    return;
  }
  isCreating.value = true;
  try {
    const input = {
      enabled: enabled.value,
      exportFormats: [...exportFormats.value],
      recipients,
      frequency: frequency.value,
      includeIntraqInsights: includeIntraqInsights.value,
      name: trimmedName,
      status: enabled.value ? 'active' : 'paused',
      subject: trimmedSubject
    };
    if (editingSubscriptionId.value) {
      const updated = await updateDashboardEmailSubscription(editingSubscriptionId.value, input);
      subscriptions.value = subscriptions.value.map(item => item.id === updated.id ? updated : item);
      status.value = `Updated email subscription ${updated.subject}`;
      resetForm();
      return;
    }
    const created = await createDashboardEmailSubscription(props.dashboardId.trim(), input);
    subscriptions.value = [created, ...subscriptions.value.filter(item => item.id !== created.id)];
    resetForm();
    status.value = `Created email subscription for ${recipientSummary(created.recipients)}`;
    emit('created', created);
  } catch (caught) {
    formError.value = readError(caught, 'Failed to save email subscription.');
    status.value = 'Email subscription was not saved';
  } finally {
    isCreating.value = false;
  }
}

async function sendTest(subscription: DashboardEmailSubscription): Promise<void> {
  testingId.value = subscription.id;
  deleteCandidateId.value = '';
  error.value = '';
  try {
    await sendDashboardEmailTest(subscription.id);
    status.value = `Test email queued for ${subscription.subject}`;
    emit('testSent', subscription);
  } catch (caught) {
    error.value = readError(caught, 'Failed to send test email.');
    status.value = 'Test email failed';
  } finally {
    testingId.value = '';
  }
}

async function openDeliveries(subscription: DashboardEmailSubscription): Promise<void> {
  selectedSubscriptionId.value = subscription.id;
  deleteCandidateId.value = '';
  deliveries.value = [];
  isLoadingDeliveries.value = true;
  error.value = '';
  try {
    deliveries.value = await listDashboardEmailDeliveries(subscription.id);
    status.value = `${deliveries.value.length} deliveries loaded for ${subscription.subject}`;
  } catch (caught) {
    error.value = readError(caught, 'Failed to load delivery history.');
    status.value = 'Delivery history failed to load';
  } finally {
    isLoadingDeliveries.value = false;
  }
}

function editSubscription(subscription: DashboardEmailSubscription): void {
  editingSubscriptionId.value = subscription.id;
  subscriptionName.value = subscription.name || subscription.subject;
  recipientsText.value = subscription.recipients.join(', ');
  frequency.value = subscription.frequency;
  subject.value = subscription.subject;
  enabled.value = subscription.enabled;
  exportFormats.value = subscription.exportFormats?.length ? subscription.exportFormats : ['pdf'];
  includeIntraqInsights.value = subscription.includeIntraqInsights ?? true;
  formError.value = '';
  status.value = `Editing subscription ${subscription.subject}`;
}

async function requestDelete(subscription: DashboardEmailSubscription): Promise<void> {
  if (deleteCandidateId.value !== subscription.id) {
    deleteCandidateId.value = subscription.id;
    status.value = `Confirm delete for ${subscription.subject}`;
    return;
  }
  deletingId.value = subscription.id;
  error.value = '';
  try {
    await deleteDashboardEmailSubscription(subscription.id);
    subscriptions.value = subscriptions.value.filter(item => item.id !== subscription.id);
    if (selectedSubscriptionId.value === subscription.id) closeDeliveries();
    status.value = `Deleted email report ${subscription.subject}`;
    emit('deleted', subscription.id);
  } catch (caught) {
    error.value = readError(caught, 'Failed to delete email subscription.');
    status.value = 'Email subscription was not deleted';
  } finally {
    deletingId.value = '';
    deleteCandidateId.value = '';
  }
}

function closeDeliveries(): void {
  selectedSubscriptionId.value = '';
  deliveries.value = [];
}

function resetForm(): void {
  editingSubscriptionId.value = '';
  subscriptionName.value = `${props.dashboardName?.trim() || 'Dashboard'} Subscription`;
  recipientsText.value = '';
  frequency.value = 'weekly';
  enabled.value = true;
  exportFormats.value = ['pdf'];
  includeIntraqInsights.value = true;
  subject.value = defaultSubject(props.dashboardName);
}

function defaultSubject(name?: string): string {
  return `${name?.trim() || 'Dashboard'} report`;
}

function recipientSummary(recipients: string[]): string {
  if (!recipients.length) return 'No recipients';
  const preview = recipients.slice(0, 2).join(', ');
  return recipients.length > 2 ? `${preview} +${recipients.length - 2} more` : preview;
}

function frequencyLabel(value: DashboardEmailReportFrequency): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusLabel(subscription: DashboardEmailSubscription): string {
  if (!subscription.enabled) return 'Paused';
  return subscription.status ?? 'Enabled';
}

function badgeClass(subscription: DashboardEmailSubscription): string {
  const value = statusLabel(subscription).toLowerCase();
  if (value === 'active' || value === 'enabled') return 'badge success';
  if (value === 'failed') return 'badge danger';
  return 'badge warning';
}

function formatDateTime(value?: string): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function toggleExportFormat(format: DashboardEmailExportFormat, checked: boolean): void {
  exportFormats.value = checked
    ? Array.from(new Set([...exportFormats.value, format]))
    : exportFormats.value.filter(item => item !== format);
}
</script>

<template>
  <div class="email-reports-backdrop" role="presentation" @click="emit('close')" @keydown.esc="emit('close')">
    <section ref="dialogEl" class="email-reports-dialog" role="dialog" aria-modal="true" aria-labelledby="email-reports-title" aria-describedby="email-reports-status" tabindex="-1" @click.stop>
      <header class="dialog-header">
        <div>
          <p class="eyebrow">Dashboard Builder</p>
          <h2 id="email-reports-title">Email Subscriptions</h2>
          <p>{{ dashboardName || 'Dashboard' }} report subscriptions and delivery history.</p>
        </div>
        <button class="icon-button" type="button" aria-label="Close email reports" @click="emit('close')">Close</button>
      </header>

      <p id="email-reports-status" class="sr-only" role="status" aria-live="polite">{{ status }}</p>
      <p v-if="error" class="message danger" role="alert">{{ error }}</p>

      <div class="dialog-grid">
        <form class="panel create-panel" aria-labelledby="create-email-report-title" @submit.prevent="submitSubscription">
          <h3 id="create-email-report-title">{{ editingSubscriptionId ? 'Edit Subscription' : 'New Subscription' }}</h3>
          <label class="field" for="email-report-name">
            <span>Subscription Name</span>
            <input id="email-report-name" v-model="subscriptionName" required autocomplete="off">
          </label>
          <label class="field" for="email-report-recipients">
            <span>Recipients</span>
            <textarea id="email-report-recipients" v-model="recipientsText" rows="3" required placeholder="owner@example.com, ops@example.com" />
          </label>
          <label class="field" for="email-report-subject">
            <span>Email Subject</span>
            <input id="email-report-subject" v-model="subject" required autocomplete="off">
          </label>
          <p class="section-label">Schedule Settings</p>
          <label class="field" for="email-report-frequency">
            <span>Frequency</span>
            <select id="email-report-frequency" v-model="frequency">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label class="check">
            <input v-model="enabled" type="checkbox">
            <span>Enabled</span>
          </label>
          <p class="section-label">Export Settings</p>
          <div class="format-options" aria-label="Export Settings">
            <label><input :checked="exportFormats.includes('pdf')" type="checkbox" @change="toggleExportFormat('pdf', ($event.target as HTMLInputElement).checked)"> PDF</label>
            <label><input :checked="exportFormats.includes('excel')" type="checkbox" @change="toggleExportFormat('excel', ($event.target as HTMLInputElement).checked)"> Excel</label>
            <label><input :checked="exportFormats.includes('csv')" type="checkbox" @change="toggleExportFormat('csv', ($event.target as HTMLInputElement).checked)"> CSV</label>
          </div>
          <label class="check">
            <input v-model="includeIntraqInsights" type="checkbox">
            <span>Include AI-generated chart insights in PDF</span>
          </label>
          <p v-if="formError" class="message danger" role="alert">{{ formError }}</p>
          <button class="primary-button" type="submit" :disabled="!canSubmit">
            {{ isCreating ? 'Saving' : editingSubscriptionId ? 'Save Subscription' : 'Create Subscription' }}
          </button>
        </form>

        <section class="panel subscriptions-panel" aria-labelledby="email-report-subscriptions-title">
          <header class="panel-header">
            <div>
              <h3 id="email-report-subscriptions-title">Subscriptions</h3>
              <p>{{ status }}</p>
            </div>
            <button class="secondary-button" type="button" :disabled="isLoading" @click="loadSubscriptions">Refresh</button>
          </header>

          <p v-if="isLoading" class="empty-state">Loading subscriptions.</p>
          <p v-else-if="subscriptions.length === 0" class="empty-state">No Email Subscriptions</p>
          <div v-else class="subscription-list" aria-label="Dashboard email subscriptions">
            <article v-for="subscription in subscriptions" :key="subscription.id" class="subscription-row" :class="{ selected: selectedSubscriptionId === subscription.id }">
              <div>
                <strong>{{ subscription.name || subscription.subject }}</strong>
                <p>{{ recipientSummary(subscription.recipients) }} - {{ frequencyLabel(subscription.frequency) }}</p>
              </div>
              <span :class="badgeClass(subscription)">{{ statusLabel(subscription) }}</span>
              <div class="row-actions">
                <button class="secondary-button" type="button" :disabled="testingId === subscription.id" :aria-label="`Send test email for ${subscription.subject}`" @click="sendTest(subscription)">
                  {{ testingId === subscription.id ? 'Sending' : 'Send Test Email' }}
                </button>
                <button class="secondary-button" type="button" :aria-label="`Preview Report for ${subscription.subject}`" @click="openDeliveries(subscription)">
                  Preview Report
                </button>
                <button class="secondary-button" type="button" :aria-label="`Edit subscription ${subscription.subject}`" @click="editSubscription(subscription)">
                  Edit Subscription
                </button>
                <button class="danger-button" type="button" :disabled="deletingId === subscription.id" :aria-label="deleteCandidateId === subscription.id ? `Confirm delete for ${subscription.subject}` : `Delete ${subscription.subject}`" @click="requestDelete(subscription)">
                  {{ deletingId === subscription.id ? 'Deleting' : deleteCandidateId === subscription.id ? 'Confirm' : 'Delete Subscription' }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>

      <section v-if="selectedSubscription" class="deliveries-panel" aria-labelledby="email-report-deliveries-title">
        <header class="panel-header">
          <div>
            <h3 id="email-report-deliveries-title">Deliveries</h3>
            <p>{{ selectedSubscription.subject }}</p>
          </div>
          <button class="secondary-button" type="button" @click="closeDeliveries">Hide</button>
        </header>
        <p v-if="isLoadingDeliveries" class="empty-state">Loading deliveries.</p>
        <p v-else-if="deliveries.length === 0" class="empty-state">No deliveries recorded for this subscription.</p>
        <div v-else class="delivery-list">
          <article v-for="delivery in deliveries" :key="delivery.id" class="delivery-row">
            <span class="badge" :class="delivery.status === 'sent' ? 'success' : 'warning'">{{ delivery.status }}</span>
            <strong>{{ recipientSummary(delivery.recipients) }}</strong>
            <span>{{ formatDateTime(delivery.deliveredAt || delivery.sentAt || delivery.createdAt) }}</span>
            <span v-if="delivery.errorMessage" class="delivery-error">{{ delivery.errorMessage }}</span>
          </article>
        </div>
      </section>
    </section>
  </div>
</template>
