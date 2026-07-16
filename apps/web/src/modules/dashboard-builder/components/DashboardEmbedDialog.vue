<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { copyTextWithFallback } from '../../shared/clipboard';
import {
  buildDashboardEmbedDetails,
  buildDashboardEmbedCode,
  generateDashboardEmbedToken,
  parseDashboardEmbedAllowedDomains,
  revokeDashboardEmbedToken,
  withoutDashboardEmbedPresentationParams,
  type DashboardEmbedDetails,
  type DashboardEmbedExpiry
} from '../embed-management-api';
import '../layout/dashboard-embed-dialog.css';

interface DashboardEmbedDialogProps {
  dashboardId: string;
  dashboardName?: string;
  defaultAllowedDomains?: string[];
  defaultExpiresIn?: DashboardEmbedExpiry | string;
  open?: boolean;
}

const props = withDefaults(defineProps<DashboardEmbedDialogProps>(), {
  dashboardName: 'Dashboard',
  defaultAllowedDomains: () => [],
  defaultExpiresIn: '24h',
  open: true
});

const emit = defineEmits<{
  close: [];
  copied: [target: 'code' | 'url'];
  error: [message: string];
  generated: [details: DashboardEmbedDetails];
  revoked: [token: string];
  'update:open': [value: boolean];
}>();

const expiryOptions: Array<{ label: string; value: string }> = [
  { label: '15 minutes', value: '15m' },
  { label: '1 hour', value: '1h' },
  { label: '24 hours', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' }
];

const domainInput = ref<HTMLTextAreaElement | null>(null);
const allowedDomainsText = ref('');
const selectedExpiry = ref<string>('24h');
const showDashboardTitle = ref(true);
const generatedEmbed = ref<DashboardEmbedDetails | null>(null);
const isGenerating = ref(false);
const isRevoking = ref(false);
const statusMessage = ref('Embed settings ready.');
const errorMessage = ref('');

const idPrefix = computed(() => `dashboard-embed-${sanitizeId(props.dashboardId) || 'dialog'}`);
const normalizedAllowedDomains = computed(() => parseDashboardEmbedAllowedDomains(allowedDomainsText.value));
const canGenerate = computed(() => Boolean(props.dashboardId.trim()) && !isGenerating.value && !isRevoking.value);
const canUseGeneratedEmbed = computed(() => generatedEmbed.value !== null && !isGenerating.value && !isRevoking.value);
const dialogDescription = computed(() => `${dialogId('description')} ${dialogId('status')}`);
const expirySelectOptions = computed(() => {
  if (expiryOptions.some(option => option.value === selectedExpiry.value)) return expiryOptions;
  return [...expiryOptions, { label: selectedExpiry.value, value: selectedExpiry.value }];
});
const allowedDomainsSummary = computed(() => {
  const count = normalizedAllowedDomains.value.length;
  if (count === 0) return 'No domain restriction';
  return `${count} allowed ${count === 1 ? 'domain' : 'domains'}`;
});
const currentEmbedUrl = computed(() => generatedEmbed.value
  ? withoutDashboardEmbedPresentationParams(generatedEmbed.value.embedUrl)
  : ''
);
const currentEmbedCode = computed(() => currentEmbedUrl.value
  ? buildDashboardEmbedCode(currentEmbedUrl.value, props.dashboardName, { includeTitle: showDashboardTitle.value })
  : ''
);
const generatedEmbedStatusLabel = computed(() => {
  if (!generatedEmbed.value) return '';
  return 'Embed Token Generated Successfully!';
});

watch(
  () => [props.dashboardId, props.defaultExpiresIn, props.defaultAllowedDomains.join('\n')],
  () => {
    resetFormFromProps();
  },
  { immediate: true }
);

watch(
  () => props.open,
  open => {
    if (open) {
      void focusDomainInput();
    }
  },
  { immediate: true }
);

function resetFormFromProps(): void {
  allowedDomainsText.value = props.defaultAllowedDomains.join('\n');
  selectedExpiry.value = props.defaultExpiresIn;
  showDashboardTitle.value = true;
  generatedEmbed.value = null;
  errorMessage.value = '';
  statusMessage.value = 'Embed settings ready.';
}

async function generateEmbed(): Promise<void> {
  if (!canGenerate.value) return;
  isGenerating.value = true;
  errorMessage.value = '';
  statusMessage.value = 'Generating embed token.';

  try {
    const token = await generateDashboardEmbedToken({
      dashboardId: props.dashboardId,
      allowedDomains: normalizedAllowedDomains.value,
      appearance: { showHeader: showDashboardTitle.value },
      expiresIn: selectedExpiry.value
    });
    const details = buildDashboardEmbedDetails(token, props.dashboardName);
    generatedEmbed.value = details;
    statusMessage.value = 'Embed Token Generated Successfully!';
    emit('generated', details);
  } catch (caught) {
    reportError(errorText(caught, 'Embed token could not be generated.'));
  } finally {
    isGenerating.value = false;
  }
}

async function revokeGeneratedToken(): Promise<void> {
  const token = generatedEmbed.value?.token;
  if (!token || isRevoking.value) return;
  isRevoking.value = true;
  errorMessage.value = '';
  statusMessage.value = 'Revoking embed token.';

  try {
    await revokeDashboardEmbedToken(token);
    generatedEmbed.value = null;
    statusMessage.value = 'Embed token revoked.';
    emit('revoked', token);
  } catch (caught) {
    reportError(errorText(caught, 'Embed token could not be revoked.'));
  } finally {
    isRevoking.value = false;
  }
}

async function copyGeneratedValue(target: 'code' | 'url'): Promise<void> {
  const details = generatedEmbed.value;
  if (!details) return;
  const value = target === 'url' ? currentEmbedUrl.value : currentEmbedCode.value;
  const copied = await copyTextWithFallback(value);
  if (!copied) {
    reportError('Clipboard is not available.');
    return;
  }
  statusMessage.value = target === 'url' ? 'Copied!' : 'Copied!';
  emit('copied', target);
}

function requestClose(): void {
  if (isGenerating.value || isRevoking.value) return;
  emit('update:open', false);
  emit('close');
}

function reportError(message: string): void {
  errorMessage.value = message;
  statusMessage.value = message;
  emit('error', message);
}

async function focusDomainInput(): Promise<void> {
  await nextTick();
  domainInput.value?.focus();
}

function dialogId(part: string): string {
  return `${idPrefix.value}-${part}`;
}

function sanitizeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function errorText(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

</script>

<template>
  <div v-if="open" class="dashboard-embed-backdrop" role="presentation" @click.self="requestClose">
    <section
      class="dashboard-embed-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="dialogId('title')"
      :aria-describedby="dialogDescription"
      @click.stop
      @keydown.esc="requestClose"
    >
      <header class="dashboard-embed-header">
        <div>
          <p class="dashboard-embed-eyebrow">Dashboard Builder</p>
          <h2 :id="dialogId('title')">Dashboard Embedding</h2>
          <p :id="dialogId('description')">{{ dashboardName }}</p>
        </div>
        <button class="dashboard-embed-close" type="button" aria-label="Close embed dialog" @click="requestClose">x</button>
      </header>

      <form class="dashboard-embed-form" aria-label="Generate dashboard embed token" @submit.prevent="generateEmbed">
        <label :for="dialogId('domains')">
          Allowed Domains (Optional)
          <textarea
            :id="dialogId('domains')"
            ref="domainInput"
            v-model="allowedDomainsText"
            :aria-describedby="dialogId('domains-help')"
            :disabled="isGenerating || isRevoking"
            rows="3"
            placeholder="reports.example.com, *.customer.com"
          ></textarea>
        </label>
        <p :id="dialogId('domains-help')" class="dashboard-embed-help">
          Separate domains with commas or new lines. Leave blank for any domain.
        </p>

        <div class="dashboard-embed-row">
          <label :for="dialogId('expiry')">
            Token Expiration
            <select :id="dialogId('expiry')" v-model="selectedExpiry" :disabled="isGenerating || isRevoking">
              <option v-for="option in expirySelectOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="dashboard-embed-domain-summary">{{ allowedDomainsSummary }}</p>
        </div>

        <label class="dashboard-embed-toggle">
          <input v-model="showDashboardTitle" type="checkbox" :disabled="isGenerating || isRevoking">
          <span>Show dashboard title</span>
        </label>

        <button class="dashboard-embed-primary" type="submit" :disabled="!canGenerate">
          {{ isGenerating ? 'Generating' : 'Generate Embed Token' }}
        </button>
      </form>

      <section class="dashboard-embed-result" aria-label="Generated embed details">
        <p v-if="generatedEmbed" class="dashboard-embed-success">{{ generatedEmbedStatusLabel }}</p>
        <label :for="dialogId('token')">
          Token
          <input :id="dialogId('token')" readonly :value="generatedEmbed?.token ?? ''" placeholder="Generate to create a token">
        </label>

        <label :for="dialogId('url')">
          Embed URL
          <span class="dashboard-embed-copy-row">
            <input :id="dialogId('url')" readonly :value="currentEmbedUrl" placeholder="Generate to create a URL">
            <button type="button" :disabled="!canUseGeneratedEmbed" @click="copyGeneratedValue('url')">Copy URL</button>
          </span>
        </label>

        <label :for="dialogId('code')">
          Iframe Embed Code
          <textarea
            :id="dialogId('code')"
            readonly
            rows="4"
            :value="currentEmbedCode"
            placeholder="Generate to create embed code"
          ></textarea>
        </label>
        <button class="dashboard-embed-secondary" type="button" :disabled="!canUseGeneratedEmbed" @click="copyGeneratedValue('code')">
          Copy
        </button>
      </section>

      <section class="dashboard-embed-security" aria-label="Security Considerations">
        <h3>Security Considerations</h3>
        <p>Use short token expiration windows and restrict allowed domains for externally shared dashboards.</p>
      </section>

      <p v-if="errorMessage" class="dashboard-embed-error" role="alert">{{ errorMessage }}</p>
      <p :id="dialogId('status')" class="dashboard-embed-status" role="status" aria-live="polite">{{ statusMessage }}</p>

      <footer class="dashboard-embed-footer">
        <button class="dashboard-embed-secondary" type="button" :disabled="isGenerating || isRevoking" @click="requestClose">Close</button>
        <button class="dashboard-embed-danger" type="button" :disabled="!canUseGeneratedEmbed" @click="revokeGeneratedToken">
          {{ isRevoking ? 'Revoking' : 'Revoke Token' }}
        </button>
      </footer>
    </section>
  </div>
</template>
