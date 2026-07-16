import { computed, ref, type Ref } from 'vue';
import type { Router } from 'vue-router';
import { clearStoredSetupRequiredFlag } from '../../router-guards';
import { readRuntimeDeploymentType } from '../../runtime-config';
import {
  fetchSetupOptions,
  fetchSetupStatus,
  runSetup
} from './api';
import { diagnosticsFromSetupState, runSetupDiagnosticsSnapshot, type SetupDiagnosticsSnapshot } from './setup-diagnostics';
import { setupCompletionFromResult, type SetupCompletionState, type SetupDiagnosticItem, type SetupFormState } from './setup-state';
import type { HealthStatus, SetupOptions, SetupStatus } from './types';

interface UseAuthSetupOptions {
  error: Ref<string>;
  health: Ref<HealthStatus | null>;
  router: Router;
  runBusy: (successMessage: string, action: () => Promise<void>) => Promise<void>;
  setError: (caught: unknown, fallback: string) => void;
  setupForm: SetupFormState;
  status: Ref<string>;
}

export function useAuthSetup(options: UseAuthSetupOptions) {
  const setupStatus = ref<SetupStatus | null>(null);
  const setupOptions = ref<SetupOptions | null>(null);
  const setupCompletion = ref<SetupCompletionState | null>(null);
  const setupDiagnostics = ref<SetupDiagnosticItem[]>(diagnosticsFromSetupState(null, null, null));
  const setupIsRunningDiagnostics = ref(false);

  const setupAlreadyComplete = computed(() => Boolean(
    setupStatus.value
      && (setupStatus.value.setupCompleted || setupStatus.value.configured || setupStatus.value.setupRequired === false)
  ));
  const isSelfHosted = computed(() =>
    readRuntimeDeploymentType() === 'self-hosted'
      || (typeof window !== 'undefined' && window.localStorage.getItem('deploymentType') === 'self-hosted')
  );
  const setupConfiguredLabel = computed(() => setupStatus.value ? (setupStatus.value.configured ? 'yes' : 'no') : '');
  const setupOptionsSummary = computed(() => setupOptions.value?.deploymentTypes.join(', ') ?? '');

  async function loadSetupState(): Promise<void> {
    await options.runBusy('Setup ready', async () => {
      [setupStatus.value, setupOptions.value] = await Promise.all([
        fetchSetupStatus(),
        fetchSetupOptions()
      ]);
      setupDiagnostics.value = diagnosticsFromSetupState(
        setupStatus.value,
        setupOptions.value,
        options.health.value
      );
    });
  }

  async function completeSetup(): Promise<void> {
    if (setupAlreadyComplete.value) {
      options.status.value = 'Setup already complete';
      if (typeof window !== 'undefined') clearStoredSetupRequiredFlag();
      await options.router.push('/login');
      return;
    }
    await options.runBusy('Setup completed', async () => {
      const result = await runSetup(options.setupForm);
      options.status.value = result.message ?? 'Setup completed';
      setupCompletion.value = setupCompletionFromResult(result, options.setupForm);
      setupStatus.value = {
        ...(setupStatus.value ?? { deploymentType: 'self-hosted', setupRequired: false }),
        configured: true,
        setupCompleted: true
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('setupFormData', JSON.stringify(options.setupForm));
        clearStoredSetupRequiredFlag();
      }
    });
  }

  async function retrySetupChecks(): Promise<void> {
    await loadSetupState();
  }

  async function runSetupDiagnostics(): Promise<void> {
    setupIsRunningDiagnostics.value = true;
    options.error.value = '';
    options.status.value = 'Checking setup';
    try {
      applySetupDiagnostics(await runSetupDiagnosticsSnapshot());
      options.status.value = setupDiagnostics.value.some(item => item.status === 'failed')
        ? 'Some setup checks need attention'
        : 'Setup checks passed';
    } catch (caught) {
      options.setError(caught, 'Setup checks failed.');
    } finally {
      setupIsRunningDiagnostics.value = false;
    }
  }

  function clearSetupCompletion(): void {
    setupCompletion.value = null;
  }

  function applySetupDiagnostics(snapshot: SetupDiagnosticsSnapshot): void {
    options.health.value = snapshot.health ?? options.health.value;
    setupOptions.value = snapshot.options ?? setupOptions.value;
    setupStatus.value = snapshot.status ?? setupStatus.value;
    setupDiagnostics.value = snapshot.diagnostics;
  }

  return {
    clearSetupCompletion,
    completeSetup,
    isSelfHosted,
    loadSetupState,
    retrySetupChecks,
    runSetupDiagnostics,
    setupAlreadyComplete,
    setupCompletion,
    setupConfiguredLabel,
    setupDiagnostics,
    setupIsRunningDiagnostics,
    setupOptions,
    setupOptionsSummary,
    setupStatus
  };
}
