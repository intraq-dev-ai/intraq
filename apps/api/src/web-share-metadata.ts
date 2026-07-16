export interface WebShareBranding {
  accentColor?: string;
  appName?: string;
  brandHeader?: string;
  brandSubHeader?: string;
  companyName?: string;
  faviconUrl?: string;
  gradientStart?: string;
  primaryColor?: string;
}

interface WebShareMetadata {
  canonicalUrl: string;
  description: string;
  faviconHref?: string;
  faviconType?: string;
  siteName: string;
  themeColor: string;
  title: string;
}

const DEFAULT_SITE_NAME = 'intraQ';
const DEFAULT_DESCRIPTION = 'intraQ analytics workspace';
const DEFAULT_PRIMARY_COLOR = '#3152ad';
const DEFAULT_FAVICON_URLS = new Set(['/favicon.ico']);

export function injectWebShareMetadata(
  html: string,
  options: { branding: WebShareBranding; requestUrl: URL }
): string {
  if (!/<\/head>/i.test(html)) return html;
  const metadata = buildWebShareMetadata(options.branding, options.requestUrl);
  const titleTag = `<title>${escapeHtml(metadata.title)}</title>`;
  const headTags = [
    `<meta name="description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta name="theme-color" content="${escapeAttribute(metadata.themeColor)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta property="og:site_name" content="${escapeAttribute(metadata.siteName)}" />`,
    `<meta property="og:url" content="${escapeAttribute(metadata.canonicalUrl)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(metadata.description)}" />`,
    `<link rel="canonical" href="${escapeAttribute(metadata.canonicalUrl)}" />`,
    ...(metadata.faviconHref && metadata.faviconType
      ? [`<link rel="icon" type="${escapeAttribute(metadata.faviconType)}" href="${escapeAttribute(metadata.faviconHref)}" />`]
      : [])
  ].join('\n    ');

  const withoutManagedTags = stripManagedHeadTags(html);
  const withTitle = /<title>[\s\S]*?<\/title>/i.test(withoutManagedTags)
    ? withoutManagedTags.replace(/<title>[\s\S]*?<\/title>/i, titleTag)
    : withoutManagedTags.replace(/<\/head>/i, `    ${titleTag}\n  </head>`);
  return withTitle.replace(/<\/head>/i, `    ${headTags}\n  </head>`);
}

export function buildWebShareMetadata(branding: WebShareBranding, requestUrl: URL): WebShareMetadata {
  const siteName = firstString(branding.brandHeader, branding.appName, branding.companyName) ?? DEFAULT_SITE_NAME;
  const description = firstString(branding.brandSubHeader, `${siteName} analytics workspace`) ?? DEFAULT_DESCRIPTION;
  const pageTitle = pageTitleForPath(requestUrl.pathname);
  const title = pageTitle ? `${pageTitle} | ${siteName}` : siteName;
  return {
    canonicalUrl: requestUrl.href,
    description,
    ...faviconMetadata(branding, requestUrl),
    siteName,
    themeColor: firstString(branding.primaryColor, branding.gradientStart, branding.accentColor) ?? DEFAULT_PRIMARY_COLOR,
    title
  };
}

function stripManagedHeadTags(html: string): string {
  return html
    .replace(/\s*<meta\s+name=["']description["'][^>]*>\n?/gi, '')
    .replace(/\s*<meta\s+name=["']theme-color["'][^>]*>\n?/gi, '')
    .replace(/\s*<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>\n?/gi, '')
    .replace(/\s*<link\s+rel=["'](?:canonical|icon|shortcut icon|apple-touch-icon)["'][^>]*>\n?/gi, '');
}

function pageTitleForPath(pathname: string): string {
  if (pathname === '/' || pathname === '') return '';
  if (pathname.startsWith('/login')) return 'Login';
  if (pathname.startsWith('/forgot-password')) return 'Forgot Password';
  if (pathname.startsWith('/reset-password')) return 'Reset Password';
  if (pathname.startsWith('/dashboard/create')) return 'Create Dashboard';
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/ai-analyzer')) return 'AI Analyzer';
  if (pathname.startsWith('/sql-editor')) return 'SQL Editor';
  if (pathname.startsWith('/data-dictionary')) return 'Data Dictionary';
  if (pathname.startsWith('/workflows')) return 'Workflows';
  if (pathname.startsWith('/admin')) return 'Admin';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/templates')) return 'Templates';
  if (pathname.startsWith('/learn')) return 'Learn';
  if (pathname.startsWith('/embed/dashboard')) return 'Dashboard';
  return '';
}

function faviconMetadata(branding: WebShareBranding, requestUrl: URL): Pick<WebShareMetadata, 'faviconHref' | 'faviconType'> {
  const configured = firstNonDefaultUrl(branding.faviconUrl);
  if (!configured) return {};
  const faviconType = configured.toLowerCase().endsWith('.ico')
    ? 'image/x-icon'
    : configured.toLowerCase().endsWith('.png') ? 'image/png' : 'image/svg+xml';
  return {
    faviconHref: absoluteUrl(configured, requestUrl),
    faviconType
  };
}

function firstNonDefaultUrl(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && !DEFAULT_FAVICON_URLS.has(trimmed)) return trimmed;
  }
  return undefined;
}

function absoluteUrl(value: string, requestUrl: URL): string {
  try {
    return new URL(value, requestUrl.origin).href;
  } catch {
    return '';
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
