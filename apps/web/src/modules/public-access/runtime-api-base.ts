import { readRuntimeApiBase } from '../../runtime-config';

export function publicAccessApiBase(): string {
  return readRuntimeApiBase();
}

export function publicAccessApiPath(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = publicAccessApiBase();
  if (base === '/api') return normalized.startsWith('/api') ? normalized : `${base}${normalized}`;
  const apiRelative = normalized.startsWith('/api/') ? normalized.slice(4) : normalized;
  return `${base}${apiRelative}`;
}
