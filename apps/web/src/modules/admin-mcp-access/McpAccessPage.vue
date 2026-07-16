<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { copyTextWithFallback } from '../shared/clipboard';
import { createMcpAccessToken, listMcpAccessTokens, revokeMcpAccessToken } from './api';
import { MCP_SCOPE_OPTIONS, endpointUrl, scopeLabel } from './normalizers';
import type { McpAccessState, McpAccessTokenRecord, McpCreatedToken, McpScope } from './types';
import '../admin/admin.css';
import '../admin/admin-base-product.css';
import './admin-mcp-access.css';

const state = ref<McpAccessState>({ allowedScopes: [], endpoint: '/mcp', tokens: [] });
const form = ref<{ expiresAt: string; name: string; scopes: McpScope[] }>({
  expiresAt: '',
  name: '',
  scopes: ['status:read']
});
const createdToken = ref<McpCreatedToken | null>(null);
const copiedKey = ref('');
const createDialogOpen = ref(false);
const error = ref('');
const status = ref('Loading MCP access');
const isLoading = ref(false);
const isSaving = ref(false);

const endpoint = computed(() => endpointUrl(state.value.endpoint));
const activeToken = computed(() => state.value.tokens.find(token => token.status === 'active') ?? null);
const previousTokens = computed(() => state.value.tokens.filter(token => token.status !== 'active'));
const canCreateToken = computed(() => !activeToken.value && allowedScopeOptions.value.length > 0);
const allowedScopeOptions = computed(() => {
  const allowed = new Set(state.value.allowedScopes);
  return MCP_SCOPE_OPTIONS.filter(option => allowed.has(option.value));
});

onMounted(() => void loadTokens());

async function loadTokens(): Promise<void> {
  isLoading.value = true;
    error.value = '';
    status.value = 'Loading MCP access';
  try {
    state.value = await listMcpAccessTokens();
    form.value.scopes = state.value.allowedScopes.length ? [...state.value.allowedScopes] : ['status:read'];
    status.value = activeToken.value ? 'MCP token ready' : 'No active MCP token';
  } catch (caught) {
    error.value = readError(caught, 'MCP access failed to load.');
    status.value = 'MCP access failed';
  } finally {
    isLoading.value = false;
  }
}

function openCreateDialog(): void {
  if (!canCreateToken.value) return;
  error.value = '';
  copiedKey.value = '';
  form.value.name = form.value.name.trim() || 'Codex MCP';
  form.value.scopes = state.value.allowedScopes.length ? [...state.value.allowedScopes] : ['status:read'];
  createDialogOpen.value = true;
}

function closeCreateDialog(): void {
  if (isSaving.value) return;
  createDialogOpen.value = false;
}

async function createToken(): Promise<void> {
  if (activeToken.value) {
    error.value = 'Revoke the current MCP token before creating a new one.';
    status.value = 'MCP token was not created';
    return;
  }
  if (!form.value.name.trim()) {
    error.value = 'Token name is required.';
    status.value = 'MCP token was not created';
    return;
  }
  if (form.value.scopes.length === 0) {
    error.value = 'Select at least one scope.';
    status.value = 'MCP token was not created';
    return;
  }

  isSaving.value = true;
  error.value = '';
  try {
    createdToken.value = await createMcpAccessToken({
      expiresAt: form.value.expiresAt || null,
      name: form.value.name.trim(),
      scopes: form.value.scopes
    });
    form.value.name = '';
    form.value.expiresAt = '';
    createDialogOpen.value = false;
    await loadTokens();
    status.value = 'MCP token created';
  } catch (caught) {
    error.value = readError(caught, 'MCP token could not be created.');
    status.value = 'MCP token creation failed';
  } finally {
    isSaving.value = false;
  }
}

async function revokeToken(record: McpAccessTokenRecord): Promise<void> {
  isSaving.value = true;
  error.value = '';
  try {
    await revokeMcpAccessToken(record.id);
    await loadTokens();
    status.value = `${record.name} revoked`;
  } catch (caught) {
    error.value = readError(caught, 'MCP token could not be revoked.');
    status.value = 'MCP token revoke failed';
  } finally {
    isSaving.value = false;
  }
}

function toggleScope(scope: McpScope, enabled: boolean): void {
  const scopes = new Set(form.value.scopes);
  if (enabled) scopes.add(scope);
  else scopes.delete(scope);
  form.value.scopes = [...scopes];
}

async function copyText(value: string, key: string): Promise<void> {
  try {
    const copied = await copyTextWithFallback(value);
    if (!copied) throw new Error('Clipboard is unavailable. Select and copy the value manually.');
    copiedKey.value = key;
    status.value = 'Copied';
  } catch (caught) {
    error.value = readError(caught, 'Copy failed.');
    status.value = 'Copy failed';
  }
}

function formatDate(value: string): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function createButtonLabel(): string {
  if (isLoading.value) return 'Loading...';
  if (activeToken.value) return 'Token Active';
  return 'Create Token';
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
</script>

<template>
  <section class="admin-page admin-base-product-page mcp-access-page" aria-labelledby="mcp-access-title" data-testid="mcp-access-page">
    <header class="admin-base-product-header">
      <div>
        <p class="eyebrow">Credentials</p>
        <h1 id="mcp-access-title" class="admin-page-title">MCP Access</h1>
        <p class="admin-page-subtitle">Connect Codex or another MCP client with one active token for this account.</p>
      </div>
      <div class="admin-base-product-actions">
        <button class="button" type="button" :disabled="isSaving || isLoading || !canCreateToken" @click="openCreateDialog">
          {{ createButtonLabel() }}
        </button>
        <button class="admin-secondary-button" type="button" :disabled="isLoading || isSaving" @click="loadTokens">Refresh</button>
      </div>
    </header>

    <article class="panel mcp-access-summary" aria-label="MCP access status">
      <div>
        <h2>{{ status }}</h2>
        <p>
          Tokens are shown once, stored as hashes, and run with this user's tenant and role access.
          Revoke the current token before creating a replacement.
        </p>
      </div>
      <span class="mcp-status" :class="activeToken ? 'active' : 'inactive'">
        {{ activeToken ? 'Connected' : 'Not connected' }}
      </span>
      <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    </article>

    <section class="mcp-access-grid">
      <article class="panel mcp-endpoint-card" aria-label="HTTP MCP endpoint">
        <div>
          <h2>Endpoint</h2>
          <p>Use this URL in your MCP client.</p>
        </div>
        <div class="mcp-copy-row">
          <code>{{ endpoint }}</code>
          <button class="admin-secondary-button" type="button" @click="copyText(endpoint, 'endpoint')">
            {{ copiedKey === 'endpoint' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <dl>
          <div>
            <dt>Transport</dt>
            <dd>HTTP JSON-RPC</dd>
          </div>
          <div>
            <dt>Authorization</dt>
            <dd>Bearer token</dd>
          </div>
        </dl>
      </article>

      <article class="panel mcp-token-card" aria-label="Current MCP token">
        <header>
          <div>
            <p class="mcp-card-label">Current Token</p>
            <h2>{{ activeToken?.name ?? 'No token created' }}</h2>
            <span v-if="activeToken" class="mcp-token-prefix">{{ activeToken.tokenPrefix }}...</span>
          </div>
          <span class="mcp-status" :class="activeToken?.status ?? 'inactive'">{{ activeToken?.status ?? 'inactive' }}</span>
        </header>
        <template v-if="activeToken">
          <dl>
            <div>
              <dt>Access</dt>
              <dd>{{ activeToken.scopes.map(scopeLabel).join(', ') || 'None' }}</dd>
            </div>
            <div>
              <dt>Last used</dt>
              <dd>{{ formatDate(activeToken.lastUsedAt) }}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{{ formatDate(activeToken.expiresAt) }}</dd>
            </div>
          </dl>
          <button class="admin-danger-button" type="button" :disabled="isSaving" @click="revokeToken(activeToken)">
            {{ isSaving ? 'Revoking...' : 'Revoke Token' }}
          </button>
        </template>
        <div v-else class="mcp-token-empty">
          <p>Create one token, add it to your MCP client, and keep it somewhere safe. It will not be shown again.</p>
          <button class="button" type="button" :disabled="isSaving || isLoading || allowedScopeOptions.length === 0" @click="openCreateDialog">
            Create Token
          </button>
        </div>
      </article>
    </section>

    <section v-if="previousTokens.length > 0" class="mcp-previous-tokens" aria-label="Previous MCP tokens">
      <h2>Previous Tokens</h2>
      <article v-for="token in previousTokens" :key="token.id" class="mcp-previous-token">
        <span>{{ token.name }}</span>
        <code>{{ token.tokenPrefix }}...</code>
        <span class="mcp-status" :class="token.status">{{ token.status }}</span>
      </article>
    </section>

    <div v-if="createDialogOpen" class="mcp-dialog-backdrop" @click.self="closeCreateDialog">
      <section class="mcp-dialog-card" role="dialog" aria-modal="true" aria-labelledby="mcp-create-token-title" tabindex="-1" @keydown.esc="closeCreateDialog" @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()">
        <header>
          <div>
            <p class="eyebrow">MCP Access</p>
            <h2 id="mcp-create-token-title">Create Token</h2>
            <p>Choose what this MCP client can do. The token will be shown once.</p>
          </div>
          <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="closeCreateDialog">Close</button>
        </header>
        <form class="mcp-token-form" aria-label="Create MCP token" @submit.prevent="createToken">
          <label>
            <span>Name</span>
            <input v-model="form.name" type="text" maxlength="80" placeholder="Codex MCP" autocomplete="off" required />
          </label>
          <label>
            <span>Expires</span>
            <input v-model="form.expiresAt" type="date" />
          </label>
          <fieldset>
            <legend>Access</legend>
            <label v-for="option in allowedScopeOptions" :key="option.value" class="mcp-scope-option">
              <input
                type="checkbox"
                :checked="form.scopes.includes(option.value)"
                @change="toggleScope(option.value, ($event.target as HTMLInputElement).checked)"
              />
              <span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.detail }}</small>
              </span>
            </label>
          </fieldset>
          <div class="mcp-dialog-actions">
            <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="closeCreateDialog">Cancel</button>
            <button class="button" type="submit" :disabled="isSaving || form.scopes.length === 0">
              {{ isSaving ? 'Creating...' : 'Create Token' }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="createdToken" class="mcp-dialog-backdrop" @click.self="createdToken = null">
      <section class="mcp-dialog-card" role="dialog" aria-modal="true" aria-labelledby="mcp-created-token-title" tabindex="-1" @keydown.esc="createdToken = null" @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()">
        <header>
          <div>
            <p class="eyebrow">MCP Access</p>
            <h2 id="mcp-created-token-title">New Token</h2>
            <p>Copy this now. You will not be able to see it again after closing.</p>
          </div>
          <button class="admin-secondary-button" type="button" @click="createdToken = null">Close</button>
        </header>
        <label class="mcp-created-token-field">
          <span>Bearer token</span>
          <input class="mcp-token-value-input" type="text" readonly :value="createdToken.token" />
        </label>
        <div class="mcp-dialog-actions">
          <button class="button" type="button" @click="copyText(createdToken.token, 'new-token')">
            {{ copiedKey === 'new-token' ? 'Copied' : 'Copy Token' }}
          </button>
          <button class="admin-secondary-button" type="button" @click="createdToken = null">Done</button>
        </div>
      </section>
    </div>
  </section>
</template>
