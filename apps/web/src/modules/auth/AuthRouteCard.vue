<script setup lang="ts">
import AuthBackendErrorPanel from './AuthBackendErrorPanel.vue';
import AuthSetupPanel from './AuthSetupPanel.vue';
import type { SetupCompletionState, SetupDiagnosticItem, SetupFormState } from './setup-state';
import type { AuthSurface } from './surfaces';
import type { SetupOptions, SetupStatus } from './types';

defineProps<{
  backendCheckedAt: string;
  backendLastError: string;
  backendRetryCount: number;
  credentials: { email: string; password: string };
  error: string;
  forgotForm: { email: string };
  loginBrandHeader: string;
  loginBrandSubHeader: string;
  isLoading: boolean;
  isSelfHosted: boolean;
  resetForm: { newPassword: string; confirmPassword: string };
  resetFormValid: boolean;
  resetPasswordMismatch: boolean;
  resetToken: string;
  routePath: string;
  setupCompletion: SetupCompletionState | null;
  setupDiagnostics: SetupDiagnosticItem[];
  setupForm: SetupFormState;
  setupAlreadyComplete: boolean;
  setupIsRunningDiagnostics: boolean;
  setupOptions: SetupOptions | null;
  setupStatus: SetupStatus | null;
  status: string;
  surface: AuthSurface;
}>();

const emit = defineEmits<{
  checkHealth: [];
  completeReset: [];
  completeSetup: [];
  goToLogin: [];
  refreshPage: [];
  retrySetupChecks: [];
  runSetupDiagnostics: [];
  sendResetLink: [];
  signIn: [];
}>();
</script>

<template>
  <article class="panel auth-card" :class="`auth-card-${surface.id}`" :aria-labelledby="`${surface.id}-form-title`">
    <div v-if="surface.id === 'login' || surface.id === 'forgot'" class="auth-login-brand">
      <div class="auth-login-brand-header">
        <div v-if="loginBrandHeader === 'intraQ'" class="auth-login-product-brand" role="img" aria-label="intraQ">
          <span class="auth-login-product-mark" aria-hidden="true">iQ</span>
          <span class="auth-login-product-title" aria-hidden="true">intraQ</span>
        </div>
        <div v-else class="auth-login-text-brand">
          <h1>{{ loginBrandHeader }}</h1>
          <p v-if="loginBrandSubHeader">{{ loginBrandSubHeader }}</p>
        </div>
      </div>
      <h2 :id="`${surface.id}-form-title`">{{ surface.title }}</h2>
    </div>
    <div v-else-if="surface.id !== 'setup'" class="auth-card-header">
      <p class="auth-pill">{{ surface.eyebrow }}</p>
      <h2 :id="`${surface.id}-form-title`">{{ surface.title }}</h2>
      <p>{{ surface.description }}</p>
    </div>

    <form v-if="surface.id === 'login'" class="auth-form" @submit.prevent="emit('signIn')">
      <label for="loginEmail">Email <input id="loginEmail" v-model="credentials.email" autocomplete="email" type="email" required placeholder="Enter your email"></label>
      <label for="loginPassword">Password <input id="loginPassword" v-model="credentials.password" autocomplete="current-password" type="password" required placeholder="Enter your password"></label>
      <button class="button auth-login-submit" type="submit" :disabled="isLoading">
        <span v-if="isLoading" class="auth-login-spinner" aria-hidden="true"></span>
        <span>{{ isLoading ? 'Signing in...' : 'Login' }}</span>
      </button>
      <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
      <div class="auth-link-row auth-login-options" aria-label="Account links">
        <RouterLink to="/forgot-password">Forgot your password?</RouterLink>
      </div>
    </form>

    <form v-else-if="surface.id === 'forgot'" class="auth-form" @submit.prevent="emit('sendResetLink')">
      <div class="auth-summary-box">
        <h3>Password Recovery</h3>
        <p class="field-help">Enter your email address and we'll send you a link to reset your password.</p>
      </div>
      <label for="forgotEmail">Email Address <input id="forgotEmail" v-model="forgotForm.email" autocomplete="email" type="email" required placeholder="Enter your email address"></label>
      <button class="button auth-login-submit" type="submit" :disabled="isLoading">{{ isLoading ? 'Sending...' : 'Send Reset Link' }}</button>
      <p v-if="status && status !== 'Ready'" class="auth-inline-status" role="status" aria-label="Auth status" aria-live="polite">{{ status }}</p>
      <div class="auth-link-row auth-login-options" aria-label="Password recovery links">
        <RouterLink to="/login">Back to Login</RouterLink>
      </div>
    </form>

    <form v-else-if="surface.id === 'reset'" class="auth-form" @submit.prevent="emit('completeReset')">
      <div v-if="!resetToken" class="error-banner" role="alert">Invalid or missing reset token. Please request a new password reset.</div>
      <label>New password <input v-model="resetForm.newPassword" autocomplete="new-password" type="password" placeholder="Enter your new password"></label>
      <p class="field-help">Password must be at least 6 characters long.</p>
      <label>Confirm New Password <input v-model="resetForm.confirmPassword" autocomplete="new-password" type="password" placeholder="Confirm your new password"></label>
      <p v-if="resetPasswordMismatch" class="error-banner" role="alert">Passwords do not match.</p>
      <button class="button" type="submit" :disabled="isLoading || !resetFormValid">Reset Password</button>
      <div class="auth-link-row" aria-label="Password reset links">
        <RouterLink to="/login">Back to Login</RouterLink>
        <RouterLink to="/forgot-password">Resend Reset Link</RouterLink>
      </div>
    </form>

    <AuthSetupPanel
      v-else-if="surface.id === 'setup'"
      :completion="setupCompletion"
      :diagnostics="setupDiagnostics"
      :error="error"
      :form="setupForm"
      :is-loading="isLoading"
      :is-running-diagnostics="setupIsRunningDiagnostics"
      :options="setupOptions"
      :setup-already-complete="setupAlreadyComplete"
      :status="setupStatus"
      @go-to-login="emit('goToLogin')"
      @retry-setup-checks="emit('retrySetupChecks')"
      @run-diagnostics="emit('runSetupDiagnostics')"
      @run-setup="emit('completeSetup')"
    />

    <AuthBackendErrorPanel
      v-else-if="surface.id === 'backend-error'"
      :checked-at="backendCheckedAt"
      :is-loading="isLoading"
      :last-error="backendLastError"
      :retry-count="backendRetryCount"
      :route-path="routePath"
      @refresh="emit('refreshPage')"
      @retry="emit('checkHealth')"
    />
  </article>
</template>
