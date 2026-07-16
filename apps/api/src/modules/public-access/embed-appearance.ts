import type { IncomingMessage } from 'node:http';
import type { EmbedAppearance } from './embed-token-store.js';
import {
  isRecord,
  readPublicBaseUrl
} from './embed-common.js';

const defaultEmbedHandshakeTimeoutMs = 15_000;
const minEmbedHandshakeTimeoutMs = 5_000;
const maxEmbedHandshakeTimeoutMs = 120_000;

export function normalizeEmbedAppearance(value: unknown): EmbedAppearance | undefined {
  if (!isRecord(value)) return undefined;
  const behavior = normalizeEmbedBehaviorOverrides(value.behavior);
  const showExpand = typeof value.showExpand === 'boolean' ? value.showExpand : undefined;
  const showExport = typeof value.showExport === 'boolean' ? value.showExport : undefined;
  const showFilters = typeof value.showFilters === 'boolean' ? value.showFilters : undefined;
  const showHeader = typeof value.showHeader === 'boolean' ? value.showHeader : undefined;
  if (showExpand === undefined && showExport === undefined && showFilters === undefined && showHeader === undefined && !behavior) return undefined;
  return {
    ...(behavior ? { behavior } : {}),
    ...(showExpand !== undefined ? { showExpand } : {}),
    ...(showExport !== undefined ? { showExport } : {}),
    ...(showFilters !== undefined ? { showFilters } : {}),
    ...(showHeader !== undefined ? { showHeader } : {})
  };
}

export function mergeEmbedAppearances(...values: Array<EmbedAppearance | undefined>): EmbedAppearance | undefined {
  const merged: EmbedAppearance = {};
  for (const value of values) {
    if (!value) continue;
    if (value.behavior) merged.behavior = { ...(merged.behavior ?? {}), ...value.behavior };
    if (typeof value.showExpand === 'boolean') merged.showExpand = value.showExpand;
    if (typeof value.showExport === 'boolean') merged.showExport = value.showExport;
    if (typeof value.showFilters === 'boolean') merged.showFilters = value.showFilters;
    if (typeof value.showHeader === 'boolean') merged.showHeader = value.showHeader;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function externalPortalEmbedUrl(req: IncomingMessage, dashboardId: string, token: string, handshakeTimeoutMs?: number): string {
  const url = new URL(`${readPublicBaseUrl(req)}/embed/dashboard/${encodeURIComponent(dashboardId)}`);
  url.searchParams.set('token', token);
  url.searchParams.set('handshake', 'required');
  if (handshakeTimeoutMs !== undefined && handshakeTimeoutMs !== defaultEmbedHandshakeTimeoutMs) {
    url.searchParams.set('handshakeTimeoutMs', String(handshakeTimeoutMs));
  }
  return url.toString();
}

function normalizeEmbedBehaviorOverrides(value: unknown): EmbedAppearance['behavior'] | undefined {
  if (!isRecord(value)) return undefined;
  const behavior: NonNullable<EmbedAppearance['behavior']> = {};
  const handshakeTimeoutMs = normalizeEmbedHandshakeTimeoutMs(value.handshakeTimeoutMs);
  if (handshakeTimeoutMs !== undefined) {
    behavior.handshakeTimeoutMs = handshakeTimeoutMs;
  }
  if (typeof value.hideMultiSelectSummary === 'boolean') {
    behavior.hideMultiSelectSummary = value.hideMultiSelectSummary;
  }
  if (typeof value.multiSelectCloseOnSelect === 'boolean') {
    behavior.multiSelectCloseOnSelect = value.multiSelectCloseOnSelect;
  }
  if (typeof value.singleSelectClearable === 'boolean') {
    behavior.singleSelectClearable = value.singleSelectClearable;
  }
  if (typeof value.singleSelectSearchable === 'boolean') {
    behavior.singleSelectSearchable = value.singleSelectSearchable;
  }
  return Object.keys(behavior).length > 0 ? behavior : undefined;
}

function normalizeEmbedHandshakeTimeoutMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.round(value), minEmbedHandshakeTimeoutMs), maxEmbedHandshakeTimeoutMs);
}
