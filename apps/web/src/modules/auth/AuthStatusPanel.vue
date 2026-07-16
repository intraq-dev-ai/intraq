<script setup lang="ts">
defineProps<{
  error: string;
  healthService: string;
  routePath: string;
  sessionAuthenticated: boolean;
  setupConfigured: string;
  setupOptionsSummary: string;
  status: string;
}>();
</script>

<template>
  <article class="panel auth-status" aria-labelledby="auth-status-title">
    <h2 id="auth-status-title">Status</h2>
    <p role="status" aria-label="Auth status" aria-live="polite">{{ status }}</p>
    <div v-if="error" class="error-banner auth-status-error" aria-label="Auth error summary">{{ error }}</div>
    <dl class="auth-summary" aria-label="Auth route details">
      <dt>Route</dt>
      <dd>{{ routePath }}</dd>
      <dt v-if="sessionAuthenticated">Session</dt>
      <dd v-if="sessionAuthenticated">Authenticated</dd>
      <dt v-if="setupConfigured">Configured</dt>
      <dd v-if="setupConfigured">{{ setupConfigured }}</dd>
      <dt v-if="setupOptionsSummary">Deployment types</dt>
      <dd v-if="setupOptionsSummary">{{ setupOptionsSummary }}</dd>
      <dt v-if="healthService">API service</dt>
      <dd v-if="healthService">{{ healthService }}</dd>
    </dl>
  </article>
</template>
