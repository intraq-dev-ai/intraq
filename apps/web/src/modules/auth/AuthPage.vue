<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { readRuntimeDeploymentType } from '../../runtime-config';
import { roleRedirectPath } from '../../router-guards';
import AuthHeroPanel from './AuthHeroPanel.vue';
import AuthRouteCard from './AuthRouteCard.vue';
import AuthStatusPanel from './AuthStatusPanel.vue';
import { forgotPassword, login, resetPassword } from './api';
import { resolveAuthSurface } from './surfaces';
import { clearAuthSession, persistAuthSession } from './session-storage';
import { defaultSetupForm, setupErrorMessage } from './setup-state';
import { useAuthSetup } from './use-auth-setup';
import { useAuthBackendRetry } from './use-auth-backend-retry';
import type { AuthSession, BrandingConfig, HealthStatus } from './types';
import {
  errorMessage,
  firstString,
  safeRedirectPath
} from './auth-page-utils';
import {
  loadBrandingState as loadAuthBrandingState,
  loadResetState as loadAuthResetState
} from './auth-route-loaders';
import './auth.css';
import './auth-login.css';

const route = useRoute();
const router = useRouter();
const surface = computed(() => resolveAuthSurface(route.name));
const titleId = computed(() => `${surface.value.id}-title`);

const credentials = reactive({ email: '', password: '' });
const forgotForm = reactive({ email: 'admin@intraq.local' });
const resetForm = reactive({ newPassword: '', confirmPassword: '' });
const setupForm = reactive(defaultSetupForm());

const status = ref('Ready');
const error = ref('');
const isLoading = ref(false);
const session = ref<AuthSession | null>(null);
const resetToken = ref('');
const branding = ref<BrandingConfig | null>(null);
const health = ref<HealthStatus | null>(null);
const lastBackendError = ref('');
const backendRetryCount = ref(0);
const backendCheckedAt = ref('');
let resetRedirectTimer: ReturnType<typeof window.setTimeout> | undefined;

const {
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
} = useAuthSetup({ error, health, router, runBusy, setError, setupForm, status });

const isReset = computed(() => surface.value.id === 'reset');
const isSetup = computed(() => surface.value.id === 'setup');
const isBackendError = computed(() => surface.value.id === 'backend-error');
const isCompactAuthSurface = computed(() =>
  surface.value.id === 'login' || surface.value.id === 'forgot'
);
const resetPasswordMismatch = computed(() =>
  Boolean(resetForm.confirmPassword && resetForm.newPassword !== resetForm.confirmPassword)
);
const resetFormValid = computed(() =>
  Boolean(resetToken.value && resetForm.newPassword.length >= 6 && resetForm.newPassword === resetForm.confirmPassword)
);
const brandHeader = computed(() => branding.value?.brandHeader ?? branding.value?.appName ?? 'intraQ');
const brandSubHeader = computed(() => branding.value?.brandSubHeader ?? '');
const platformBrandHeader = computed(() => 'intraQ');
const authIsSelfHosted = computed(() =>
  isSelfHosted.value
    || branding.value?.isSelfHosted === true
    || branding.value?.deploymentType === 'self-hosted'
);
const authIsCloudHosted = computed(() => readRuntimeDeploymentType() === 'cloud');
const authUsesPlatformBrand = computed(() => authIsCloudHosted.value && !authIsSelfHosted.value);
const loginBrandHeader = computed(() => authIsSelfHosted.value ? brandHeader.value : platformBrandHeader.value);
const loginBrandSubHeader = computed(() => authIsSelfHosted.value ? brandSubHeader.value : '');
const routePill = computed(() => surface.value.eyebrow);
const sessionAuthenticated = computed(() =>
  Boolean(session.value?.token || session.value?.accessToken || session.value?.tokens?.accessToken)
);
const healthService = computed(() => health.value?.service ?? '');
const {
  checkHealth,
  clearBackendRetryTimer,
  loadBackendErrorState,
  refreshPage
} = useAuthBackendRetry({
  backendCheckedAt,
  backendRetryCount,
  error,
  health,
  isBackendError,
  isLoading,
  lastBackendError,
  router,
  status
});

onMounted(() => {
  void loadRouteState();
});

onUnmounted(() => {
  clearBackendRetryTimer();
  clearResetRedirectTimer();
});

watch(() => route.fullPath, () => {
  void loadRouteState();
});

async function loadRouteState(): Promise<void> {
  clearBackendRetryTimer();
  clearResetRedirectTimer();
  error.value = '';
  session.value = null;
  clearSetupCompletion();
  try {
    await loadAuthBrandingState({ branding, usesPlatformBrand: authUsesPlatformBrand.value });
    if (isReset.value) {
      loadAuthResetState({ query: route.query, resetForm, resetToken, setClientError, status });
    } else if (isSetup.value) {
      await loadSetupState();
    } else if (isBackendError.value) {
      loadBackendErrorState();
    } else {
      status.value = `${surface.value.title} ready`;
    }
  } catch (caught) {
    setError(caught, `${surface.value.title} failed to load.`);
  }
}

async function signIn(): Promise<void> {
  await runBusy('Signing in', async () => {
    clearAuthSession();
    session.value = await login(credentials.email, credentials.password);
    persistAuthSession(session.value, credentials.email);
    status.value = `Signed in as ${session.value.user?.email ?? credentials.email}`;
    await redirectAfterAuth();
  });
}

async function goToLogin(): Promise<void> {
  clearSetupRedirectTimer();
  await router.push('/login');
}

async function sendResetLink(): Promise<void> {
  await runBusy('Password reset link sent', async () => {
    const result = await forgotPassword(forgotForm.email);
    status.value = result.message ?? 'Password reset link sent';
    forgotForm.email = '';
  });
}

async function completeReset(): Promise<void> {
  if (!resetToken.value) {
    setClientError('Invalid or missing reset token. Please request a new password reset.');
    return;
  }
  if (resetForm.newPassword.length < 6) {
    setClientError('Password must be at least 6 characters long.');
    return;
  }
  if (resetForm.newPassword !== resetForm.confirmPassword) {
    setClientError('Passwords do not match.');
    return;
  }
  await runBusy('Resetting password', async () => {
    const result = await resetPassword(resetToken.value, resetForm.newPassword);
    status.value = `${result.message ?? 'Password reset successfully'}! Redirecting to login...`;
    resetRedirectTimer = window.setTimeout(() => {
      void router.push('/login');
    }, 2000);
  });
}

function clearResetRedirectTimer(): void {
  if (!resetRedirectTimer) return;
  window.clearTimeout(resetRedirectTimer);
  resetRedirectTimer = undefined;
}

async function runBusy(successMessage: string, action: () => Promise<void>): Promise<void> {
  isLoading.value = true;
  error.value = '';
  status.value = successMessage;
  try {
    await action();
  } catch (caught) {
    setError(caught, `${surface.value.title} action failed.`);
  } finally {
    isLoading.value = false;
  }
}

function setError(caught: unknown, fallback: string): void {
  error.value = setupErrorMessage(errorMessage(caught, fallback));
  status.value = fallback;
}

function setClientError(message: string): void {
  error.value = message;
  status.value = message;
}

async function redirectAfterAuth(): Promise<void> {
  await router.push(safeRedirectPath(route.query.redirect, roleRedirectPath()));
}
</script>

<template>
  <section
    class="auth-page"
    :class="[`auth-page-${surface.id}`, { 'auth-page-setup-flow': isSetup, 'auth-page-platform-brand': authUsesPlatformBrand }]"
    :aria-labelledby="`${surface.id}-form-title`"
  >
    <header v-if="surface.id !== 'login'" class="page-header" aria-hidden="true">
      <p class="eyebrow">{{ surface.eyebrow }}</p>
      <p :id="titleId">{{ surface.title }}</p>
      <p>{{ surface.description }}</p>
    </header>

    <div class="auth-layout">
      <AuthHeroPanel
        v-if="!isCompactAuthSurface && surface.id !== 'setup'"
        :admin-email="setupForm.adminEmail" :brand-header="brandHeader"
        :brand-sub-header="brandSubHeader" :route-pill="routePill"
        :tenant-name="setupForm.companyName" :workspace-title="surface.title"
      />

      <main class="auth-main">
        <AuthRouteCard
          :backend-checked-at="backendCheckedAt" :backend-last-error="lastBackendError" :backend-retry-count="backendRetryCount"
          :credentials="credentials" :error="error" :forgot-form="forgotForm"
          :is-loading="isLoading" :is-self-hosted="authIsSelfHosted" :login-brand-header="loginBrandHeader"
          :login-brand-sub-header="loginBrandSubHeader"
          :reset-form="resetForm"
          :reset-form-valid="resetFormValid" :reset-password-mismatch="resetPasswordMismatch" :reset-token="resetToken"
          :route-path="route.fullPath" :setup-completion="setupCompletion" :setup-diagnostics="setupDiagnostics"
          :setup-already-complete="setupAlreadyComplete" :setup-form="setupForm" :setup-is-running-diagnostics="setupIsRunningDiagnostics" :setup-options="setupOptions" :setup-status="setupStatus"
          :status="status" :surface="surface"
          @check-health="checkHealth"
          @complete-reset="completeReset"
          @complete-setup="completeSetup" @go-to-login="goToLogin"
          @refresh-page="refreshPage" @retry-setup-checks="retrySetupChecks"
          @run-setup-diagnostics="runSetupDiagnostics"
          @send-reset-link="sendResetLink" @sign-in="signIn"
        />

        <AuthStatusPanel
          v-if="!isCompactAuthSurface && surface.id !== 'setup'"
          :error="error" :health-service="healthService" :route-path="route.fullPath"
          :session-authenticated="sessionAuthenticated" :setup-configured="setupConfiguredLabel"
          :setup-options-summary="setupOptionsSummary" :status="status"
        />
      </main>
    </div>
  </section>
</template>
