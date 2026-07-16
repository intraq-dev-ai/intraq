import type { Ref } from 'vue';
import { applyBrandThemeVariables } from '../shell/tenant-branding';
import { fetchBrandingConfig } from './api';
import { firstString } from './auth-page-utils';
import type { BrandingConfig } from './types';

export async function loadBrandingState(options: {
  branding: Ref<BrandingConfig | null>;
  usesPlatformBrand: boolean;
}): Promise<void> {
  try {
    options.branding.value = await fetchBrandingConfig();
  } catch {
    if (!options.branding.value) {
      options.branding.value = {
        appName: 'intraQ',
        brandHeader: 'intraQ',
        brandSubHeader: ''
      };
    }
  }
  if (options.branding.value && !options.usesPlatformBrand) applyBrandThemeVariables(options.branding.value);
}

export function loadResetState(options: {
  query: Record<string, unknown>;
  resetForm: { confirmPassword: string; newPassword: string };
  resetToken: Ref<string>;
  setClientError: (message: string) => void;
  status: Ref<string>;
}): void {
  options.resetToken.value = firstString(options.query.token) ?? '';
  options.resetForm.newPassword = '';
  options.resetForm.confirmPassword = '';
  if (!options.resetToken.value) {
    options.setClientError('Invalid or missing reset token. Please request a new password reset.');
    return;
  }
  options.status.value = 'Reset Password ready';
}
