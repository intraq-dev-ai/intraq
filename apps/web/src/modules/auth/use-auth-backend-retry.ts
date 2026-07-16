import type { ComputedRef, Ref } from 'vue';
import type { Router } from 'vue-router';
import { fetchHealth } from './api';
import type { HealthStatus } from './types';
import { errorMessage } from './auth-page-utils';

export function useAuthBackendRetry(options: {
  backendCheckedAt: Ref<string>;
  backendRetryCount: Ref<number>;
  error: Ref<string>;
  health: Ref<HealthStatus | null>;
  isBackendError: ComputedRef<boolean>;
  isLoading: Ref<boolean>;
  lastBackendError: Ref<string>;
  router: Router;
  status: Ref<string>;
}) {
  let backendRetryTimer: ReturnType<typeof window.setTimeout> | undefined;

  function loadBackendErrorState(): void {
    options.health.value = null;
    options.backendRetryCount.value = 0;
    options.backendCheckedAt.value = new Date().toLocaleString();
    options.lastBackendError.value = typeof window === 'undefined' ? '' : window.localStorage.getItem('lastBackendError') ?? '';
    options.status.value = 'Backend connection failed';
    scheduleBackendRetry();
  }

  async function checkHealth(): Promise<void> {
    await retryBackendConnection(false);
  }

  async function retryBackendConnection(isAutomatic: boolean): Promise<void> {
    clearBackendRetryTimer();
    options.isLoading.value = true;
    options.error.value = '';
    options.backendRetryCount.value += 1;
    options.backendCheckedAt.value = new Date().toLocaleString();
    options.status.value = isAutomatic ? 'Retrying backend connection' : 'Checking backend health';
    try {
      options.health.value = await fetchHealth();
      options.lastBackendError.value = '';
      if (typeof window !== 'undefined') window.localStorage.removeItem('lastBackendError');
      options.status.value = 'Backend recovered. Redirecting to login.';
      await options.router.push('/login');
    } catch (caught) {
      const message = errorMessage(caught, 'Backend connection failed.');
      options.lastBackendError.value = message;
      if (typeof window !== 'undefined') window.localStorage.setItem('lastBackendError', message);
      options.status.value = 'Backend connection failed';
      if (!isAutomatic) options.error.value = message;
      if (isAutomatic) scheduleBackendRetry();
    } finally {
      options.isLoading.value = false;
    }
  }

  function refreshPage(): void {
    window.location.reload();
  }

  function scheduleBackendRetry(): void {
    clearBackendRetryTimer();
    if (!options.isBackendError.value || options.backendRetryCount.value >= 3 || typeof window === 'undefined') return;
    backendRetryTimer = window.setTimeout(() => {
      void retryBackendConnection(true);
    }, 5000);
  }

  function clearBackendRetryTimer(): void {
    if (!backendRetryTimer) return;
    window.clearTimeout(backendRetryTimer);
    backendRetryTimer = undefined;
  }

  return {
    checkHealth,
    clearBackendRetryTimer,
    loadBackendErrorState,
    refreshPage
  };
}
