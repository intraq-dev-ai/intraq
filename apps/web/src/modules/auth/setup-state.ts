export interface SetupFormState {
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  companyDomain: string;
  companyName: string;
  enableDemoContent: boolean;
  enableSampleData: boolean;
}

export interface SetupCompletionState {
  adminEmail: string;
  adminName: string;
  completedAt: string;
  companyName: string;
  message: string;
  mode: 'setup';
}

export interface SetupDiagnosticItem {
  details: string;
  name: string;
  status: 'failed' | 'pending' | 'success';
}

export interface SetupCompletionResult {
  adminUser?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  message?: string;
  setupCompletedAt?: string;
}

export function defaultSetupForm(): SetupFormState {
  return {
    adminEmail: '',
    adminFirstName: '',
    adminLastName: '',
    adminPassword: '',
    companyDomain: '',
    companyName: '',
    enableDemoContent: false,
    enableSampleData: false
  };
}

export function setupErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('unable to connect')
    || normalized.includes('network error')
    || normalized.includes('econnrefused')
    || normalized.includes('timeout')
  ) {
    return 'Unable to connect to the setup service. Check your connection and try again.';
  }
  return message;
}

export function setupCompletionFromResult(
  result: SetupCompletionResult,
  form: SetupFormState
): SetupCompletionState {
  const firstName = result.adminUser?.firstName ?? form.adminFirstName;
  const lastName = result.adminUser?.lastName ?? form.adminLastName;
  return {
    adminEmail: result.adminUser?.email ?? form.adminEmail,
    adminName: `${firstName} ${lastName}`.trim() || 'N/A',
    completedAt: result.setupCompletedAt ?? new Date().toISOString(),
    companyName: form.companyName || 'N/A',
    message: result.message ?? 'intraQ is ready to use.',
    mode: 'setup'
  };
}

export function formatSetupDate(value: string): string {
  if (!value) return 'Just now';
  return new Date(value).toLocaleString();
}
