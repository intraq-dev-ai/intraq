import { readString } from './embed-dashboard-utils';

const defaultEmbedHandshakeTimeoutMs = 15_000;
const minEmbedHandshakeTimeoutMs = 5_000;
const maxEmbedHandshakeTimeoutMs = 120_000;

export function embedErrorDetails(message: string): string {
  if (message.includes('expired')) return 'The embed token has expired. Request a new embed URL.';
  if (message.includes('Domain not allowed')) return 'This dashboard cannot be embedded on the current domain.';
  if (message.includes('Parent origin') || message.includes('handshake')) return 'Open this dashboard from the approved customer portal.';
  if (message.includes('Dashboard not found')) return 'The requested dashboard is no longer available.';
  if (message.includes('token')) return 'Open the route with a valid token query parameter.';
  return 'Check the embed token, dashboard ID, and public API availability.';
}

export function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

export function isTokenExpiredErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase().replace(/[\s_-]+/g, ' ');
  return /\btoken\b/.test(normalized) && /\b(expired|invalid|unauthorized)\b/.test(normalized);
}

export function readHandshakeTimeoutMs(value: unknown): number {
  const rawValue = readRouteValue(value);
  if (!rawValue) return defaultEmbedHandshakeTimeoutMs;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return defaultEmbedHandshakeTimeoutMs;
  return Math.min(Math.max(Math.round(parsed), minEmbedHandshakeTimeoutMs), maxEmbedHandshakeTimeoutMs);
}

export function readRouteValue(value: unknown): string {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return readString(firstValue) ?? '';
}
