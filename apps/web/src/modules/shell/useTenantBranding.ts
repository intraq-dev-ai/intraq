import { onMounted, ref, type Ref } from 'vue';
import {
  applyTenantBrandingTheme,
  readCurrentTenantBranding,
  type TenantBranding
} from './tenant-branding';

export function useTenantBranding(): { tenantBranding: Ref<TenantBranding> } {
  const tenantBranding = ref<TenantBranding>(readCurrentTenantBranding());

  function syncTenantBranding(): void {
    tenantBranding.value = readCurrentTenantBranding();
    applyTenantBrandingTheme(tenantBranding.value);
  }

  onMounted(() => {
    syncTenantBranding();
  });

  return { tenantBranding };
}
