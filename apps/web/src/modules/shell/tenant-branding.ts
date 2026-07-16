export interface TenantBranding {
  displayName: string;
  faviconInitials: string;
  faviconUrl: string;
  gradientEnd: string;
  gradientStart: string;
  homeLabel: string;
  logoTextColor: string;
  primaryColor: string;
  subHeader: string;
}

export interface BrandThemeSource {
  gradientEnd?: string;
  gradientStart?: string;
  primaryColor?: string;
}

const DEFAULT_BRANDING: TenantBranding = {
  displayName: 'intraQ',
  faviconInitials: '',
  faviconUrl: '',
  gradientEnd: '#3152ad',
  gradientStart: '#6c8eee',
  homeLabel: 'intraQ home',
  logoTextColor: '',
  primaryColor: '#3152ad',
  subHeader: ''
};

export function defaultTenantBranding(): TenantBranding {
  return { ...DEFAULT_BRANDING };
}

export function normalizeTenantBranding(): TenantBranding {
  return defaultTenantBranding();
}

export function readCurrentTenantBranding(): TenantBranding {
  return defaultTenantBranding();
}

export function applyTenantBrandingTheme(branding: TenantBranding = DEFAULT_BRANDING): void {
  applyBrandThemeVariables(branding);
}

export function applyBrandThemeVariables(branding: BrandThemeSource = DEFAULT_BRANDING): void {
  if (typeof document === 'undefined') return;
  for (const [name, value] of Object.entries(buildBrandThemeVariables(branding))) {
    document.documentElement.style.setProperty(name, value);
  }
}

export function buildBrandThemeVariables(branding: BrandThemeSource = DEFAULT_BRANDING): Record<string, string> {
  const primaryColor = branding.primaryColor || DEFAULT_BRANDING.primaryColor;
  const gradientStart = branding.gradientStart || DEFAULT_BRANDING.gradientStart;
  const gradientEnd = branding.gradientEnd || DEFAULT_BRANDING.gradientEnd;
  return {
    '--brand-gold': primaryColor,
    '--color-primary': primaryColor,
    '--color-primary-contrast': '#ffffff',
    '--tenant-admin-primary': primaryColor,
    '--tenant-admin-primary-strong': '#24438f',
    '--tenant-gradient-end': gradientEnd,
    '--tenant-gradient-start': gradientStart
  };
}

export async function fetchCurrentTenantBranding(): Promise<TenantBranding> {
  const branding = defaultTenantBranding();
  applyTenantBrandingTheme(branding);
  return branding;
}
