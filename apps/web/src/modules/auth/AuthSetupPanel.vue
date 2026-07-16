<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SetupOptions, SetupStatus } from './types';
import { formatSetupDate, type SetupCompletionState, type SetupDiagnosticItem, type SetupFormState } from './setup-state';

const props = defineProps<{
  completion: SetupCompletionState | null;
  diagnostics: SetupDiagnosticItem[];
  error: string;
  form: SetupFormState;
  isLoading: boolean;
  isRunningDiagnostics: boolean;
  options: SetupOptions | null;
  setupAlreadyComplete: boolean;
  status: SetupStatus | null;
}>();

const emit = defineEmits<{
  goToLogin: [];
  retrySetupChecks: [];
  runDiagnostics: [];
  runSetup: [];
}>();

interface SetupStepDefinition {
  description: string;
  id: string;
  label: string;
  title: string;
}

const setupSteps: SetupStepDefinition[] = [
  {
    description: 'Configure your organization details.',
    id: 'company',
    label: 'Company',
    title: 'Company Information'
  },
  {
    description: 'Create the administrator account for intraQ.',
    id: 'admin',
    label: 'Admin User',
    title: 'Admin User'
  },
  {
    description: 'Review optional features and complete setup.',
    id: 'configuration',
    label: 'Configuration',
    title: 'Configuration'
  }
];

const currentStep = ref(0);
const activeStep = computed<SetupStepDefinition>(() => setupSteps[currentStep.value] ?? setupSteps[0]!);
const canCompleteSetup = computed(() => setupSteps.every((_step, index) => isStepComplete(index)));

watch(
  () => props.completion,
  () => {
    currentStep.value = 0;
  }
);

function goToStep(index: number): void {
  if (index <= currentStep.value) currentStep.value = index;
}

function nextStep(): void {
  if (!isStepComplete(currentStep.value) || currentStep.value >= setupSteps.length - 1) return;
  currentStep.value += 1;
}

function previousStep(): void {
  if (currentStep.value <= 0) return;
  currentStep.value -= 1;
}

function isStepComplete(index: number): boolean {
  switch (index) {
    case 0:
      return props.form.companyName.trim().length > 0;
    case 1:
      return props.form.adminFirstName.trim().length > 0
        && props.form.adminLastName.trim().length > 0
        && props.form.adminEmail.trim().length > 0
        && props.form.adminPassword.length >= 8;
    case 2:
      return true;
    default:
      return false;
  }
}
</script>

<template>
  <section v-if="completion" class="setup-completed" role="status" aria-label="Setup completion">
    <div class="setup-success-mark" aria-hidden="true">✓</div>
    <h3>Setup complete</h3>
    <p>{{ completion.message }}</p>
    <dl class="auth-summary setup-completion-summary" aria-label="Setup completion summary">
      <dt>Company</dt><dd>{{ completion.companyName }}</dd>
      <dt>Admin email</dt><dd>{{ completion.adminEmail }}</dd>
      <dt>Admin name</dt><dd>{{ completion.adminName }}</dd>
      <dt>Completed</dt><dd>{{ formatSetupDate(completion.completedAt) }}</dd>
    </dl>
    <section class="setup-next-steps" aria-labelledby="setup-next-steps-title">
      <h4 id="setup-next-steps-title">Next steps</h4>
      <ol>
        <li>Sign in with the admin account you just created.</li>
        <li>Connect your data sources.</li>
        <li>Create your first dashboard.</li>
        <li>Invite team members.</li>
      </ol>
    </section>
    <button class="button" type="button" @click="emit('goToLogin')">Go to login</button>
  </section>

  <section v-else-if="setupAlreadyComplete" class="setup-completed" role="status" aria-label="Setup already complete">
    <div class="setup-success-mark" aria-hidden="true">✓</div>
    <h3>Setup already complete</h3>
    <p>This self-hosted workspace has already been configured. Sign in to continue.</p>
    <button class="button" type="button" @click="emit('goToLogin')">Go to login</button>
  </section>

  <form v-else class="auth-form setup-form" @submit.prevent="emit('runSetup')">
    <header class="setup-card-heading">
      <div class="setup-logo">
        <div class="setup-product-brand" aria-label="intraQ">
          <span class="setup-product-mark" aria-hidden="true">iQ</span>
          <h3 id="setup-form-title">intraQ</h3>
        </div>
        <p>Self-Hosted Setup</p>
      </div>
      <div class="setup-step-indicator" role="list" aria-label="Setup progress">
        <button
          v-for="(step, index) in setupSteps"
          :key="step.id"
          type="button"
          :class="['setup-progress-step', { active: currentStep === index, completed: currentStep > index }]"
          :aria-current="currentStep === index ? 'step' : undefined"
          :disabled="index > currentStep"
          @click="goToStep(index)"
        >
          <span class="setup-step-number">{{ index + 1 }}</span>
          <span class="setup-step-label">{{ step.label }}</span>
        </button>
      </div>
    </header>

    <div class="setup-content">
      <section v-if="error" class="setup-diagnostics-alert" role="alert" aria-label="Setup error diagnostics">
        <h3>We could not complete setup</h3>
        <p>{{ error }}</p>
        <ol>
          <li>Make sure this app is running and connected to its database.</li>
          <li>Confirm company and admin user details are complete.</li>
          <li>Try again after the database is ready.</li>
        </ol>
      </section>

      <template>
        <section v-if="currentStep === 0" class="setup-section setup-step-panel" aria-labelledby="setup-company-title">
          <h2 id="setup-company-title">{{ activeStep.title }}</h2>
          <p class="step-description">{{ activeStep.description }}</p>
          <div class="setup-grid">
            <label for="companyName">Company Name <input id="companyName" v-model="form.companyName" required placeholder="Your company name"></label>
            <label for="companyDomain">Company Domain <input id="companyDomain" v-model="form.companyDomain" placeholder="yourcompany.com"></label>
          </div>

          <div class="setup-form-actions">
            <button class="button" type="button" :disabled="isLoading || !isStepComplete(0)" @click="nextStep">Continue</button>
          </div>
        </section>

        <section v-else-if="currentStep === 1" class="setup-section setup-step-panel" aria-labelledby="setup-admin-title">
          <h2 id="setup-admin-title">{{ activeStep.title }}</h2>
          <p class="step-description">{{ activeStep.description }}</p>
          <div class="setup-grid">
            <label for="adminFirstName">First Name <input id="adminFirstName" v-model="form.adminFirstName" required autocomplete="given-name" placeholder="John"></label>
            <label for="adminLastName">Last Name <input id="adminLastName" v-model="form.adminLastName" required autocomplete="family-name" placeholder="Doe"></label>
            <label for="adminEmail">Email Address <input id="adminEmail" v-model="form.adminEmail" type="email" required autocomplete="email" placeholder="admin@yourcompany.com"></label>
            <label for="adminPassword">Password <input id="adminPassword" v-model="form.adminPassword" type="password" required autocomplete="new-password" minlength="8" placeholder="Choose a secure password"></label>
          </div>
          <p class="help-text">Password must be at least 8 characters long.</p>
          <div class="setup-form-actions">
            <button class="button button-secondary" type="button" @click="previousStep">Back</button>
            <button class="button" type="button" :disabled="isLoading || !isStepComplete(1)" @click="nextStep">Continue</button>
          </div>
        </section>

        <section v-else class="setup-section setup-step-panel" aria-labelledby="setup-features-title">
          <h2 id="setup-features-title">{{ activeStep.title }}</h2>
          <p class="step-description">{{ activeStep.description }}</p>
          <div class="setup-nested-panel">
            <h3>Optional Features</h3>
            <label class="checkbox-label">
              <input v-model="form.enableSampleData" type="checkbox">
              <span><strong>Include sample data</strong><br>Load example data sources and dashboards for testing.</span>
            </label>
            <label class="checkbox-label">
              <input v-model="form.enableDemoContent" type="checkbox">
              <span><strong>Create demo content</strong><br>Generate demonstration dashboards and reports.</span>
            </label>
          </div>

          <div class="setup-nested-panel" aria-labelledby="setup-review-title">
            <h3 id="setup-review-title">Review</h3>
            <div class="setup-step-grid" aria-label="Setup steps">
              <div class="setup-step">
                <span>Company</span>
                <strong>{{ form.companyName || 'Required' }}</strong>
              </div>
              <div class="setup-step">
                <span>Admin user</span>
                <strong>{{ form.adminEmail || 'Required' }}</strong>
              </div>
              <div class="setup-step">
                <span>Install type</span>
                <strong>{{ status?.deploymentType ?? options?.deploymentTypes?.join(', ') ?? 'self-hosted' }}</strong>
              </div>
            </div>
          </div>

          <div class="setup-form-actions">
            <button class="button button-secondary" type="button" @click="previousStep">Back</button>
            <button class="button" type="submit" :disabled="isLoading || !canCompleteSetup">{{ isLoading ? 'Setting up...' : 'Complete Setup' }}</button>
          </div>
        </section>
      </template>

      <details class="setup-diagnostics">
        <summary>Need help? Setup checks</summary>
        <p class="field-help">Use these checks if setup does not complete as expected.</p>
        <div class="setup-diagnostic-list" role="region" aria-label="Setup check results">
          <article v-for="item in diagnostics" :key="item.name" class="setup-diagnostic-item">
            <span :class="['setup-diagnostic-status', item.status]">{{ item.status }}</span>
            <strong>{{ item.name }}</strong>
            <p>{{ item.details }}</p>
          </article>
        </div>
        <div class="auth-actions">
          <button class="button button-secondary" type="button" :disabled="isLoading" @click="emit('retrySetupChecks')">Check again</button>
          <button class="button" type="button" :disabled="isRunningDiagnostics" @click="emit('runDiagnostics')">
            {{ isRunningDiagnostics ? 'Checking...' : 'Run checks' }}
          </button>
        </div>
      </details>
    </div>
  </form>
</template>
