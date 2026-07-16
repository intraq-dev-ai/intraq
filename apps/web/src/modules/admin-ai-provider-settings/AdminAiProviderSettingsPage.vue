<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  CODEX_MODEL_OPTIONS,
  DEFAULT_SETTINGS,
  deleteProviderConfig,
  disconnectCodex,
  fetchAiProviderSettings,
  fetchCodexStatus,
  processCodexRedirectUrl,
  providerLabel,
  resolveTenantId,
  saveAiProvider,
  saveCodexModel,
  saveProviderConfig,
  startCodexOAuth,
  testProviderConfig,
  type AiProvider,
  type AiProviderSettings,
  type CodexConnectionStatus
} from './api';
import './admin-ai-provider-settings.css';

const settings = ref<AiProviderSettings>({ ...DEFAULT_SETTINGS });
const codexStatus = ref<CodexConnectionStatus | null>(null);
const tenantId = ref(resolveTenantId());
const status = ref('Loading AI provider settings');
const error = ref('');
const loading = ref(false);
const saving = ref(false);
const redirectUrl = ref('');
const showRedirectPanel = ref(false);
const codexModel = ref(CODEX_MODEL_OPTIONS[0]);
const openaiForm = ref({ apiKey: '', baseUrl: DEFAULT_SETTINGS.openai.baseUrl, model: DEFAULT_SETTINGS.openai.model });
const geminiForm = ref({ apiKey: '', baseUrl: DEFAULT_SETTINGS.gemini.baseUrl, model: DEFAULT_SETTINGS.gemini.model });

const providerCards = computed(() => [
  {
    id: 'codex' as const,
    title: 'Codex OAuth',
    description: 'Use Codex OAuth credentials saved locally by this app.',
    ready: codexStatus.value?.connected === true
  },
  {
    id: 'openai' as const,
    title: 'OpenAI',
    description: 'Use your own OpenAI API key. No intraQ cloud service is called.',
    ready: settings.value.openai.apiKeyConfigured
  },
  {
    id: 'gemini' as const,
    title: 'Gemini',
    description: 'Use your own Google Gemini API key. No intraQ cloud service is called.',
    ready: settings.value.gemini.apiKeyConfigured
  }
]);

onMounted(() => {
  void loadPage();
});

async function loadPage(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [nextSettings, nextCodex] = await Promise.all([
      fetchAiProviderSettings(),
      fetchCodexStatus(tenantId.value)
    ]);
    settings.value = nextSettings;
    codexStatus.value = nextCodex;
    codexModel.value = nextCodex.model || CODEX_MODEL_OPTIONS[0];
    openaiForm.value = { apiKey: '', baseUrl: nextSettings.openai.baseUrl, model: nextSettings.openai.model };
    geminiForm.value = { apiKey: '', baseUrl: nextSettings.gemini.baseUrl, model: nextSettings.gemini.model };
    status.value = 'AI provider settings loaded';
  } catch (caught) {
    error.value = readError(caught, 'AI provider settings failed to load.');
    status.value = 'AI provider settings failed to load';
  } finally {
    loading.value = false;
  }
}

async function selectProvider(provider: AiProvider): Promise<void> {
  saving.value = true;
  error.value = '';
  try {
    const result = await saveAiProvider(provider);
    settings.value = { ...settings.value, provider: result.provider };
    status.value = `${providerLabel(provider)} enabled`;
  } catch (caught) {
    error.value = readError(caught, `Failed to enable ${providerLabel(provider)}.`);
  } finally {
    saving.value = false;
  }
}

async function saveKey(provider: 'gemini' | 'openai'): Promise<void> {
  saving.value = true;
  error.value = '';
  try {
    const form = provider === 'openai' ? openaiForm.value : geminiForm.value;
    const config = await saveProviderConfig(provider, form);
    settings.value = { ...settings.value, [provider]: config };
    form.apiKey = '';
    status.value = `${providerLabel(provider)} settings saved locally`;
  } catch (caught) {
    error.value = readError(caught, `Failed to save ${providerLabel(provider)} settings.`);
  } finally {
    saving.value = false;
  }
}

async function removeKey(provider: 'gemini' | 'openai'): Promise<void> {
  saving.value = true;
  error.value = '';
  try {
    await deleteProviderConfig(provider);
    await loadPage();
    status.value = `${providerLabel(provider)} settings removed`;
  } catch (caught) {
    error.value = readError(caught, `Failed to remove ${providerLabel(provider)} settings.`);
  } finally {
    saving.value = false;
  }
}

async function testKey(provider: 'gemini' | 'openai'): Promise<void> {
  saving.value = true;
  error.value = '';
  try {
    await testProviderConfig(provider);
    status.value = `${providerLabel(provider)} configuration is present`;
  } catch (caught) {
    error.value = readError(caught, `${providerLabel(provider)} configuration test failed.`);
  } finally {
    saving.value = false;
  }
}

async function connectCodex(): Promise<void> {
  saving.value = true;
  error.value = '';
  try {
    const start = await startCodexOAuth(tenantId.value);
    showRedirectPanel.value = true;
    status.value = 'OpenAI authorization window opened';
    if (start.authorizationUrl) {
      const popup = window.open(start.authorizationUrl, 'codex-oauth', 'width=640,height=760,scrollbars=yes');
      if (!popup) error.value = 'Popup blocked. Open the authorization URL manually, then paste the redirect URL here.';
    }
  } catch (caught) {
    error.value = readError(caught, 'Codex OAuth could not start.');
  } finally {
    saving.value = false;
  }
}

async function submitCodexRedirect(): Promise<void> {
  if (!redirectUrl.value.trim()) {
    error.value = 'Redirect URL is required.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await processCodexRedirectUrl(redirectUrl.value.trim());
    redirectUrl.value = '';
    showRedirectPanel.value = false;
    codexStatus.value = await fetchCodexStatus(tenantId.value);
    status.value = 'Codex OAuth connected and saved locally';
  } catch (caught) {
    error.value = readError(caught, 'Failed to process Codex redirect URL.');
  } finally {
    saving.value = false;
  }
}

async function updateCodexModel(): Promise<void> {
  saving.value = true;
  error.value = '';
  try {
    await saveCodexModel(tenantId.value, codexModel.value);
    codexStatus.value = await fetchCodexStatus(tenantId.value);
    status.value = 'Codex model saved locally';
  } catch (caught) {
    error.value = readError(caught, 'Failed to save Codex model.');
  } finally {
    saving.value = false;
  }
}

async function removeCodex(): Promise<void> {
  saving.value = true;
  error.value = '';
  try {
    await disconnectCodex(tenantId.value);
    codexStatus.value = await fetchCodexStatus(tenantId.value);
    status.value = 'Codex disconnected';
  } catch (caught) {
    error.value = readError(caught, 'Failed to disconnect Codex.');
  } finally {
    saving.value = false;
  }
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
</script>

<template>
  <section class="admin-page ai-provider-page" aria-labelledby="ai-provider-settings-title">
    <header class="admin-page-header">
      <p class="eyebrow">AI & MCP</p>
      <h1 id="ai-provider-settings-title" class="admin-page-title">AI Provider Settings</h1>
      <p class="admin-page-subtitle">
        Configure the local AI provider used by Analyzer, Dashboard Builder, and SQL Assistant.
        This page supports Codex OAuth, OpenAI, and Gemini only. It does not use intraQ managed cloud AI.
      </p>
    </header>

    <article class="panel ai-provider-status" role="status" aria-live="polite">
      <div>
        <h2>{{ status }}</h2>
        <p>Active provider: <strong>{{ providerLabel(settings.provider) }}</strong></p>
      </div>
      <button class="admin-secondary-button" type="button" :disabled="loading || saving" @click="loadPage">Refresh</button>
      <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    </article>

    <section class="ai-provider-grid" aria-label="Provider selection">
      <button
        v-for="provider in providerCards"
        :key="provider.id"
        class="panel ai-provider-card"
        :class="{ selected: settings.provider === provider.id }"
        type="button"
        :disabled="saving"
        @click="selectProvider(provider.id)"
      >
        <span class="ai-provider-card-title">{{ provider.title }}</span>
        <span class="ai-provider-card-description">{{ provider.description }}</span>
        <span class="ai-provider-ready" :class="{ ready: provider.ready }">{{ provider.ready ? 'Configured' : 'Not configured' }}</span>
      </button>
    </section>

    <section class="ai-provider-columns">
      <article class="panel ai-provider-config">
        <h2>Codex OAuth</h2>
        <p>Codex OAuth is saved in the local database and restored on server start.</p>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{{ codexStatus?.connected ? 'Connected' : 'Not connected' }}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{{ codexStatus?.model || codexModel }}</dd>
          </div>
        </dl>
        <label>
          Codex model
          <select v-model="codexModel">
            <option v-for="model in CODEX_MODEL_OPTIONS" :key="model" :value="model">{{ model }}</option>
          </select>
        </label>
        <div class="ai-provider-actions">
          <button class="button" type="button" :disabled="saving" @click="connectCodex">{{ codexStatus?.connected ? 'Reconnect Codex' : 'Connect Codex' }}</button>
          <button class="admin-secondary-button" type="button" :disabled="saving" @click="updateCodexModel">Save model</button>
          <button class="admin-secondary-button danger" type="button" :disabled="saving || !codexStatus?.connected" @click="removeCodex">Disconnect</button>
        </div>
        <div v-if="showRedirectPanel" class="ai-provider-redirect">
          <p>After signing in, paste the callback/redirect URL here if the popup does not complete automatically.</p>
          <input v-model="redirectUrl" type="text" placeholder="http://localhost:1455/auth/callback?code=...&state=...">
          <button class="admin-secondary-button" type="button" :disabled="saving" @click="submitCodexRedirect">Submit redirect URL</button>
        </div>
      </article>

      <article class="panel ai-provider-config">
        <h2>OpenAI</h2>
        <p>Your OpenAI key is stored locally. Leave API key blank to keep the existing saved key.</p>
        <label>
          API key
          <input v-model="openaiForm.apiKey" type="password" placeholder="sk-...">
          <small v-if="settings.openai.apiKeyConfigured">A key is already saved.</small>
        </label>
        <label>
          Base URL
          <input v-model="openaiForm.baseUrl" type="text">
        </label>
        <label>
          Model
          <input v-model="openaiForm.model" type="text">
        </label>
        <div class="ai-provider-actions">
          <button class="button" type="button" :disabled="saving" @click="saveKey('openai')">Save OpenAI</button>
          <button class="admin-secondary-button" type="button" :disabled="saving" @click="testKey('openai')">Check config</button>
          <button class="admin-secondary-button danger" type="button" :disabled="saving || !settings.openai.apiKeyConfigured" @click="removeKey('openai')">Remove</button>
        </div>
      </article>

      <article class="panel ai-provider-config">
        <h2>Gemini</h2>
        <p>Your Gemini key is stored locally. Leave API key blank to keep the existing saved key.</p>
        <label>
          API key
          <input v-model="geminiForm.apiKey" type="password" placeholder="AIza...">
          <small v-if="settings.gemini.apiKeyConfigured">A key is already saved.</small>
        </label>
        <label>
          Base URL
          <input v-model="geminiForm.baseUrl" type="text">
        </label>
        <label>
          Model
          <input v-model="geminiForm.model" type="text">
        </label>
        <div class="ai-provider-actions">
          <button class="button" type="button" :disabled="saving" @click="saveKey('gemini')">Save Gemini</button>
          <button class="admin-secondary-button" type="button" :disabled="saving" @click="testKey('gemini')">Check config</button>
          <button class="admin-secondary-button danger" type="button" :disabled="saving || !settings.gemini.apiKeyConfigured" @click="removeKey('gemini')">Remove</button>
        </div>
      </article>
    </section>
  </section>
</template>
