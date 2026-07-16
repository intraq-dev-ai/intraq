export interface AnalyzerUnmappedConceptEvent {
  at: string;
  conversationId?: string;
  coverageRatio?: number;
  dataSourceId: string;
  invalidFields?: string[];
  meaningfulTokens?: string[];
  metadata?: Record<string, unknown>;
  question: string;
  reason: string;
  tableId?: string;
  tableName?: string;
  tenantId?: string;
  unsupportedConcepts: string[];
  userId?: string;
}

export interface AnalyzerCapabilityGapIdentity {
  conversationId?: string;
  dataSourceId: string;
  tenantId: string;
  userId: string;
}

export interface AnalyzerUnmappedConceptPersistence {
  save(event: AnalyzerUnmappedConceptEvent): Promise<void> | void;
}

export interface AnalyzerUnmappedConceptEventListFilters {
  dataSourceId?: string;
  limit?: number;
  tenantId?: string;
}

const DEFAULT_LIST_LIMIT = 500;
const MAX_EVENTS = 500;
const MAX_LIST_LIMIT = 1000;
const events: AnalyzerUnmappedConceptEvent[] = [];
let persistence: AnalyzerUnmappedConceptPersistence | null = null;

export function configureAnalyzerUnmappedConceptPersistence(
  nextPersistence: AnalyzerUnmappedConceptPersistence | null
): void {
  persistence = nextPersistence;
}

export function recordAnalyzerUnmappedConceptEvent(
  event: Omit<AnalyzerUnmappedConceptEvent, 'at'>
): AnalyzerUnmappedConceptEvent {
  const saved = {
    ...event,
    at: new Date().toISOString()
  };
  events.push(saved);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  if (persistence) {
    void Promise.resolve(persistence.save(saved)).catch(() => {
      // Persistence is best-effort; the in-memory buffer keeps the improvement loop observable.
    });
  }
  return saved;
}

export function listAnalyzerUnmappedConceptEvents(
  filtersOrLimit: AnalyzerUnmappedConceptEventListFilters | number = {}
): AnalyzerUnmappedConceptEvent[] {
  const filters = typeof filtersOrLimit === 'number' ? { limit: filtersOrLimit } : filtersOrLimit;
  const safeLimit = analyzerUnmappedConceptEventListLimit(filters.limit);
  return events
    .filter(event => unmappedConceptEventMatchesFilters(event, filters))
    .slice()
    .reverse()
    .slice(0, safeLimit)
    .map(event => ({ ...event }));
}

export function analyzerUnmappedConceptEventListLimit(limit: number | undefined): number {
  const parsed = typeof limit === 'number' && Number.isFinite(limit)
    ? Math.trunc(limit)
    : DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIST_LIMIT);
}

export function resetAnalyzerUnmappedConceptEventsForTest(): void {
  events.splice(0, events.length);
  persistence = null;
}

function unmappedConceptEventMatchesFilters(
  event: AnalyzerUnmappedConceptEvent,
  filters: AnalyzerUnmappedConceptEventListFilters
): boolean {
  if (!matchesOptionalStringFilter(event.tenantId, filters.tenantId)) return false;
  if (!matchesOptionalStringFilter(event.dataSourceId, filters.dataSourceId)) return false;
  return true;
}

function matchesOptionalStringFilter(value: string | undefined, filter: string | undefined): boolean {
  const normalized = filter?.trim();
  return !normalized || value === normalized;
}
