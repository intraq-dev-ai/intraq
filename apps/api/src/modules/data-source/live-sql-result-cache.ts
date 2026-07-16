import type { SqlQueryResult } from './sql-query-types.js';

const DEFAULT_LIVE_SQL_CACHE_TTL_MS = 30_000;
const MAX_LIVE_SQL_CACHE_TTL_MS = 300_000;
const DEFAULT_LIVE_SQL_CACHE_MAX_ENTRIES = 50;
const MAX_LIVE_SQL_CACHE_MAX_ENTRIES = 500;

interface LiveSqlResultCacheEntry {
  expiresAt: number;
  value: SqlQueryResult;
}

const liveSqlResultCache = new Map<string, LiveSqlResultCacheEntry>();

export function getCachedLiveSqlResult(key: string, now = Date.now()): SqlQueryResult | null {
  pruneExpiredEntries(now);
  const entry = liveSqlResultCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    liveSqlResultCache.delete(key);
    return null;
  }
  liveSqlResultCache.delete(key);
  liveSqlResultCache.set(key, entry);
  return entry.value;
}

export function setCachedLiveSqlResult(key: string, value: SqlQueryResult, now = Date.now()): void {
  const ttlMs = liveSqlCacheTtlMs();
  if (ttlMs <= 0) return;
  pruneExpiredEntries(now);
  liveSqlResultCache.delete(key);
  liveSqlResultCache.set(key, {
    expiresAt: now + ttlMs,
    value
  });
  trimCache();
}

export function resetLiveSqlResultCacheForTest(): void {
  liveSqlResultCache.clear();
}

function liveSqlCacheTtlMs(): number {
  const envValue = process.env.INTRAQ_LIVE_SQL_CACHE_TTL_MS;
  if (envValue === undefined) return DEFAULT_LIVE_SQL_CACHE_TTL_MS;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_LIVE_SQL_CACHE_TTL_MS;
  return Math.min(MAX_LIVE_SQL_CACHE_TTL_MS, Math.floor(parsed));
}

function liveSqlCacheMaxEntries(): number {
  const envValue = process.env.INTRAQ_LIVE_SQL_CACHE_MAX_ENTRIES;
  if (envValue === undefined) return DEFAULT_LIVE_SQL_CACHE_MAX_ENTRIES;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIVE_SQL_CACHE_MAX_ENTRIES;
  return Math.min(MAX_LIVE_SQL_CACHE_MAX_ENTRIES, Math.floor(parsed));
}

function pruneExpiredEntries(now: number): void {
  for (const [key, entry] of liveSqlResultCache.entries()) {
    if (entry.expiresAt <= now) liveSqlResultCache.delete(key);
  }
}

function trimCache(): void {
  const maxEntries = liveSqlCacheMaxEntries();
  while (liveSqlResultCache.size > maxEntries) {
    const oldestKey = liveSqlResultCache.keys().next().value;
    if (!oldestKey) return;
    liveSqlResultCache.delete(oldestKey);
  }
}

function cloneResult(value: SqlQueryResult): SqlQueryResult {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as SqlQueryResult;
}
