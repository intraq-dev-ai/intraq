import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import { resolvedTheme, subscribeTheme, type ResolvedTheme } from '../theme/theme';
import { readCurrentTenantBranding, type TenantBranding } from './tenant-branding';

export interface DocumentBranding {
  accentColor: string;
  displayName: string;
  faviconInitials: string;
  faviconUrl: string;
  isSelfHosted: boolean;
  primaryColor: string;
  subHeader: string;
}

const DEFAULT_DISPLAY_NAME = 'intraQ';
const DEFAULT_DESCRIPTION = '';
const DEFAULT_PRIMARY_COLOR = '#3152ad';
const DEFAULT_ACCENT_COLOR = '#6c8eee';
const DEFAULT_FAVICON_URLS = new Set(['/favicon.ico']);

export function installDocumentBranding(router: Router): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const apply = () => {
    applyDocumentBranding(
      resolveDocumentBrandingForRoute(readCurrentTenantBranding(), null, router.currentRoute.value),
      router.currentRoute.value,
      resolvedTheme()
    );
  };
  const unsubscribeTheme = subscribeTheme(() => apply());
  const removeRouteHook = router.afterEach(() => apply());
  apply();
  return () => {
    unsubscribeTheme();
    removeRouteHook();
  };
}

export function resolveDocumentBranding(
  tenantBranding: TenantBranding,
  _publicBrandingSource: unknown
): DocumentBranding {
  return brandingFromTenantBrand(tenantBranding);
}

export function resolveDocumentBrandingForRoute(
  tenantBranding: TenantBranding,
  publicBrandingSource: unknown,
  route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path'>
): DocumentBranding {
  void route;
  return resolveDocumentBranding(tenantBranding, publicBrandingSource);
}

export function documentTitleForRoute(
  route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path'>,
  displayName: string
): string {
  const pageTitle = routeTitle(route);
  return pageTitle ? `${pageTitle} | ${displayName}` : displayName;
}

export function faviconHrefForBranding(branding: DocumentBranding, theme: ResolvedTheme): string {
  void theme;
  const explicit = firstNonDefaultUrl(branding.faviconUrl);
  if (explicit) return explicit;
  const initials = branding.faviconInitials?.replace(/\s/g, '').toUpperCase().slice(0, 2) || 'IQ';
  return generateTextFavicon(initials, branding.primaryColor || DEFAULT_PRIMARY_COLOR, branding.accentColor);
}

export function applyDocumentBranding(
  branding: DocumentBranding,
  route: RouteLocationNormalizedLoaded,
  theme: ResolvedTheme
): void {
  const title = documentTitleForRoute(route, branding.displayName);
  const description = branding.subHeader || `${branding.displayName} analytics workspace`;
  document.title = title;
  upsertMeta('name', 'description', description);
  upsertMeta('name', 'theme-color', branding.primaryColor || DEFAULT_PRIMARY_COLOR);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:site_name', branding.displayName);
  upsertMeta('property', 'og:url', window.location.href);
  upsertMeta('name', 'twitter:card', 'summary');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertLink('canonical', window.location.href);
  upsertFavicon(faviconHrefForBranding(branding, theme));
}

function brandingFromTenantBrand(branding: TenantBranding): DocumentBranding {
  return {
    accentColor: branding.gradientEnd || DEFAULT_ACCENT_COLOR,
    displayName: DEFAULT_DISPLAY_NAME,
    faviconInitials: branding.faviconInitials || 'IQ',
    faviconUrl: branding.faviconUrl,
    isSelfHosted: true,
    primaryColor: branding.primaryColor || DEFAULT_PRIMARY_COLOR,
    subHeader: branding.subHeader || DEFAULT_DESCRIPTION
  };
}

function generateTextFavicon(initials: string, primaryColor: string, accentColor?: string): string {
  const fontSize = initials.length === 1 ? 18 : 14;
  const bg = accentColor && accentColor !== primaryColor
    ? `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${escSvg(primaryColor)}"/><stop offset="100%" stop-color="${escSvg(accentColor)}"/></linearGradient>`
    : '';
  const fill = bg ? 'url(#g)' : escSvg(primaryColor);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    bg ? `<defs>${bg}</defs>` : '',
    `<rect width="32" height="32" rx="7" fill="${fill}"/>`,
    `<text x="16" y="${fontSize === 18 ? 22 : 21}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${fontSize}" fill="#fff">${initials}</text>`,
    '</svg>'
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escSvg(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function routeTitle(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path'>): string {
  const name = typeof route.name === 'string' ? route.name : '';
  const path = route.path;
  if (name === 'login' || path.startsWith('/login')) return 'Login';
  if (name === 'forgot-password' || path.startsWith('/forgot-password')) return 'Forgot Password';
  if (name === 'reset-password' || path.startsWith('/reset-password')) return 'Reset Password';
  if (path.startsWith('/dashboard/create')) return 'Create Dashboard';
  if (path.startsWith('/dashboard')) return 'Dashboard';
  if (path.startsWith('/ai-analyzer')) return 'AI Analyzer';
  if (path.startsWith('/sql-editor')) return 'SQL Editor';
  if (path.startsWith('/data-dictionary')) return 'Data Dictionary';
  if (path.startsWith('/workflows')) return 'Workflows';
  if (path.startsWith('/admin')) return 'Admin';
  if (path.startsWith('/profile')) return 'Profile';
  if (path.startsWith('/templates')) return 'Templates';
  if (path.startsWith('/learn')) return 'Learn';
  return '';
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  const selector = `meta[${attribute}="${cssEscape(key)}"]`;
  let meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function upsertLink(rel: string, href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${cssEscape(rel)}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

function upsertFavicon(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
  link.type = href.endsWith('.ico') ? 'image/x-icon' : href.endsWith('.png') ? 'image/png' : 'image/svg+xml';
}

function firstNonDefaultUrl(...values: string[]): string | undefined {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !DEFAULT_FAVICON_URLS.has(trimmed)) return trimmed;
  }
  return undefined;
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
