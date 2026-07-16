<script setup lang="ts">
defineProps<{
  checkedAt: string;
  isLoading: boolean;
  lastError: string;
  retryCount: number;
  routePath: string;
}>();

const emit = defineEmits<{
  refresh: [];
  retry: [];
}>();
</script>

<template>
  <div class="backend-state" aria-label="Backend recovery panel">
    <div class="backend-alert" role="alert">
      <h3>Backend Service Unavailable</h3>
      <p>The backend service is currently not responding. This could be due to startup, database, configuration, or network issues.</p>
    </div>
    <ul class="backend-checks" aria-label="Backend recovery checks">
      <li>Backend server may be starting up or restarting.</li>
      <li>Confirm the backend service is running.</li>
      <li>Check database connectivity and environment variables.</li>
      <li>Check firewall, proxy, or local network rules if requests are blocked.</li>
      <li>Retry the health endpoint when the service is ready.</li>
    </ul>
    <div class="auth-actions">
      <button class="button" type="button" :disabled="isLoading" @click="emit('retry')">
        {{ isLoading ? 'Checking...' : 'Check Again' }}
      </button>
      <button class="button button-secondary" type="button" @click="emit('refresh')">Refresh Page</button>
    </div>
    <details class="auth-summary-box">
      <summary>Technical Details</summary>
      <dl class="auth-summary" aria-label="Backend technical details">
        <dt>URL</dt><dd>{{ routePath }}</dd>
        <dt>Time</dt><dd>{{ checkedAt }}</dd>
        <dt>Status</dt><dd>Backend connection failed</dd>
        <dt>Health endpoint</dt><dd>/api/health</dd>
        <dt>Retry attempts</dt><dd>{{ retryCount }}</dd>
        <dt>Auto retry limit</dt><dd>3 attempts</dd>
      </dl>
      <div v-if="lastError" class="backend-error-log" aria-label="Backend last error">
        <strong>Last Error</strong>
        <pre>{{ lastError }}</pre>
      </div>
    </details>
    <section class="auth-summary-box backend-developer-help" aria-labelledby="backend-developer-help-title">
      <h3 id="backend-developer-help-title">For Developers</h3>
      <p>Check your backend service logs, database connection, environment variables, and API base URL before retrying.</p>
    </section>
  </div>
</template>
