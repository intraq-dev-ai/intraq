import {
  applyTenantBrandingTheme,
  readCurrentTenantBranding
} from './tenant-branding';

export async function bootstrapBranding(): Promise<void> {
  if (typeof window === 'undefined') return;
  applyTenantBrandingTheme(readCurrentTenantBranding());
}
