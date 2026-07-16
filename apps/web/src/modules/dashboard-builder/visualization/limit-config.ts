export const LEGACY_IMPLICIT_VISUALIZATION_LIMIT = 25;

export function readConfiguredVisualizationLimit(config: Record<string, unknown> | null | undefined): number | undefined {
  if (!config) return undefined;
  const limit = readPositiveInteger(config.limit);
  if (limit === undefined) return undefined;
  if (config.limitExplicit === true) return limit;
  return limit === LEGACY_IMPLICIT_VISUALIZATION_LIMIT ? undefined : limit;
}

export function readStoredVisualizationLimit(config: Record<string, unknown> | null | undefined): number {
  return readPositiveInteger(config?.limit) ?? LEGACY_IMPLICIT_VISUALIZATION_LIMIT;
}

export function shouldPersistVisualizationLimit(limit: unknown, explicit: boolean): boolean {
  const normalized = readPositiveInteger(limit);
  if (normalized === undefined) return false;
  return explicit || normalized !== LEGACY_IMPLICIT_VISUALIZATION_LIMIT;
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}
