export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'intraq-theme';
const SQL_THEME_STORAGE_KEY = 'intraq-sql-theme';
const listeners = new Set<(theme: ResolvedTheme, preference: ThemePreference) => void>();

let preference: ThemePreference = 'light';
let mediaQuery: MediaQueryList | null = null;

export function initializeTheme(): void {
  if (typeof window === 'undefined') return;
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  preference = readStoredPreference();
  applyTheme();
  mediaQuery.addEventListener('change', applyTheme);
}

export function currentThemePreference(): ThemePreference {
  return preference;
}

export function resolvedTheme(): ResolvedTheme {
  if (preference === 'system') return mediaQuery?.matches ? 'dark' : 'light';
  return preference;
}

export function setThemePreference(nextPreference: ThemePreference): void {
  preference = nextPreference;
  window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  window.localStorage.setItem(SQL_THEME_STORAGE_KEY, resolvedTheme());
  applyTheme();
}

export function toggleResolvedTheme(): ResolvedTheme {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  setThemePreference(next);
  return next;
}

export function subscribeTheme(listener: (theme: ResolvedTheme, preference: ThemePreference) => void): () => void {
  listeners.add(listener);
  listener(resolvedTheme(), preference);
  return () => listeners.delete(listener);
}

function readStoredPreference(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  return 'light';
}

function applyTheme(): void {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark-theme', theme === 'dark');
  document.documentElement.classList.toggle('light-theme', theme === 'light');
  window.localStorage.setItem(SQL_THEME_STORAGE_KEY, theme);
  listeners.forEach(listener => listener(theme, preference));
}
