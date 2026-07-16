export interface BrandingConfig {
  appName: string;
  faviconInitials: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  supportEmail: string;
  updatedAt: string;
  brandHeader?: string;
  brandSubHeader?: string;
  companyName?: string;
  deploymentType?: string;
  gradientEnd?: string;
  gradientStart?: string;
  isSelfHosted?: boolean;
}

const DEFAULT_PLATFORM_FAVICON_URLS = new Set(['/favicon.ico']);

export function brandingWithDeployment(config: BrandingConfig, deploymentType: string): BrandingConfig {
  const isSelfHosted = deploymentType === 'self-hosted';
  const faviconUrl = isSelfHosted && isDefaultPlatformFavicon(config.faviconUrl) ? '' : config.faviconUrl;
  return {
    ...config,
    faviconUrl,
    deploymentType,
    isSelfHosted
  };
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDefaultPlatformFavicon(value: unknown): boolean {
  return typeof value === 'string' && DEFAULT_PLATFORM_FAVICON_URLS.has(value.trim());
}
