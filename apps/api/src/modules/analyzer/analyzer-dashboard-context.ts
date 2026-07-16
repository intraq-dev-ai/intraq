import { isRecord, readString } from './analyzer-plan-utils.js';

const DASHBOARD_SCOPES = new Set(['component', 'dashboard', 'related']);
const MAX_COMPONENTS = 12;
const MAX_FILTERS = 8;
const DASHBOARD_DISPLAY_REFERENCE_TOKENS = new Set([
  'all', 'component', 'components', 'current', 'dashboard', 'selected', 'this', 'visible'
]);
const DASHBOARD_DISPLAY_QUALIFIER_TOKENS = new Set([
  'category', 'categories', 'context', 'data', 'exposure', 'exposures', 'financial', 'for',
  'from', 'in', 'metric', 'metrics', 'of', 'on', 'scope', 'the', 'type', 'types', 'value',
  'values', 'view'
]);
const DASHBOARD_COMPARISON_INTENT = /\b(?:biggest|compare|comparison|first|highest|largest|least|lowest|most|priority|rank|smallest|top)\b/i;

export function sanitizeAnalyzerDashboardContext(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || value.origin !== 'dashboard-ai') return undefined;
  const scope = readString(value.scope);
  if (!scope || !DASHBOARD_SCOPES.has(scope)) return undefined;
  const components = sanitizeRecords(value.components, MAX_COMPONENTS, sanitizeComponent);
  const filters = sanitizeRecords(value.filters, MAX_FILTERS, sanitizeFilter);
  const selectedComponent = sanitizeComponent(value.selectedComponent);
  return {
    components,
    contentTrust: 'untrusted-display-context',
    dashboardId: boundedString(value.dashboardId, 160) ?? '',
    dashboardName: boundedString(value.dashboardName, 160) ?? '',
    filters,
    origin: 'dashboard-ai',
    scope,
    ...(scope === 'component' && selectedComponent ? { selectedComponent } : {})
  };
}

export function analyzerDashboardRoutingHint(value: unknown): Record<string, unknown> | undefined {
  const context = sanitizeAnalyzerDashboardContext(value);
  if (!context) return undefined;
  const cardMetricGroups = dashboardCardMetricGroups(context).map(({ searchText: _searchText, ...group }) => group);
  return {
    present: true,
    scope: context.scope,
    models: dashboardContextModels(context),
    ...(cardMetricGroups.length > 0 ? { cardMetricGroups } : {})
  };
}

export function analyzerDashboardRoutingCandidates(value: unknown): Record<string, unknown> | null {
  const context = sanitizeAnalyzerDashboardContext(value);
  if (!context) return null;
  const models = dashboardContextModels(context);
  if (models.length === 0) return null;
  return {
    allowDirectSchemaShortcut: true,
    allowAiReadyRoutingShortcut: false,
    source: 'dashboard-context',
    candidates: models.map((model, index) => ({
      ...(model.dataSourceTableId ? { id: model.dataSourceTableId } : {}),
      ...(model.tableName ? { name: model.tableName } : {}),
      rank: index + 1
    }))
  };
}

export function analyzerDashboardComponentModelKeys(body: unknown): { ids: string[]; names: string[] } | null {
  const bodyRecord = isRecord(body) ? body : {};
  const context = sanitizeAnalyzerDashboardContext(bodyRecord.dashboardContext);
  if (context?.scope !== 'component' || !isRecord(context.selectedComponent)) return null;
  const id = boundedString(context.selectedComponent.dataSourceTableId, 160);
  const name = identifier(context.selectedComponent.tableName);
  return id || name ? {
    ids: id ? [id] : [],
    names: name ? [name] : []
  } : null;
}

export function analyzerDashboardContextSignature(value: unknown): string | null {
  const context = sanitizeAnalyzerDashboardContext(value);
  return context ? JSON.stringify(context) : null;
}

export function shouldCorrectDashboardConversationIntent(body: unknown, question: string): boolean {
  const bodyRecord = isRecord(body) ? body : {};
  if (!analyzerDashboardRoutingHint(bodyRecord.dashboardContext)) return false;
  const normalized = question.trim().replace(/\s+/g, ' ');
  if (!normalized || DASHBOARD_CONVERSATION_ONLY.test(normalized)) return false;
  return !DASHBOARD_PRODUCT_ACTION.test(normalized);
}

export function isDashboardDisplayReferenceFilter(body: unknown, filter: unknown): boolean {
  const bodyRecord = isRecord(body) ? body : {};
  if (!analyzerDashboardRoutingHint(bodyRecord.dashboardContext) || !isRecord(filter)) return false;
  const values = [filter.field, filter.label, filter.searchText, filter.value]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .flatMap(value => typeof value === 'string' ? value.toLowerCase().match(/[a-z0-9]+/g) ?? [] : []);
  return values.some(token => DASHBOARD_DISPLAY_REFERENCE_TOKENS.has(token))
    && values.every(token =>
      DASHBOARD_DISPLAY_REFERENCE_TOKENS.has(token) || DASHBOARD_DISPLAY_QUALIFIER_TOKENS.has(token)
    );
}

export function isDashboardAnswerFramingMeasure(body: unknown, value: unknown): boolean {
  const bodyRecord = isRecord(body) ? body : {};
  if (!analyzerDashboardRoutingHint(bodyRecord.dashboardContext)) return false;
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Boolean(text) && /\b(?:action|actions|priorit(?:y|ize)|recommend(?:ation|ed)?|should|next step)\b/.test(text);
}

export function analyzerDashboardComparisonMeasures(body: unknown, question: string): string[] {
  const bodyRecord = isRecord(body) ? body : {};
  const context = sanitizeAnalyzerDashboardContext(bodyRecord.dashboardContext);
  if (context?.scope !== 'dashboard' || !DASHBOARD_COMPARISON_INTENT.test(question)) return [];
  const groups = dashboardCardMetricGroups(context).filter(group => group.fields.length > 1);
  if (groups.length === 0) return [];
  const questionTokens = tokenSet(question);
  const ranked = groups.map(group => ({
    group,
    score: overlapScore(questionTokens, tokenSet(group.searchText))
  })).sort((left, right) => right.score - left.score || right.group.fields.length - left.group.fields.length);
  if (groups.length > 1 && ranked[0]?.score === ranked[1]?.score) return [];
  return ranked[0]?.group.fields ?? [];
}

const DASHBOARD_CONVERSATION_ONLY = /^(?:(?:hi|hello|hey|thanks|thank you|ok|okay|cool|great|good morning|good afternoon|good evening)[.!?]*|(?:what can you do|how can you help|help)[.!?]*)$/i;
const DASHBOARD_PRODUCT_ACTION = /\b(?:add|build|change|create|delete|edit|email|export|make|publish|remove|schedule|update)\b[\s\S]{0,80}\b(?:automation|chart|dashboard|endpoint|filter|kpi|report|table|widget|workflow)\b|\b(?:automation|chart|dashboard|endpoint|filter|kpi|report|table|widget|workflow)\b[\s\S]{0,80}\b(?:add|build|change|create|delete|edit|email|export|make|publish|remove|schedule|update)\b/i;

function sanitizeComponent(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const id = boundedString(value.id, 160);
  const name = boundedString(value.name, 200);
  if (!id || !name) return undefined;
  const fields = identifierArray(value.fields, 20);
  return {
    id,
    name,
    ...(boundedString(value.kind, 80) ? { kind: boundedString(value.kind, 80) } : {}),
    ...(boundedString(value.dataSourceId, 160) ? { dataSourceId: boundedString(value.dataSourceId, 160) } : {}),
    ...(boundedString(value.dataSourceTableId, 160)
      ? { dataSourceTableId: boundedString(value.dataSourceTableId, 160) }
      : {}),
    ...(fields.length > 0 ? { fields } : {}),
    ...(boundedString(value.tableName, 160) ? { tableName: boundedString(value.tableName, 160) } : {}),
    ...(boundedString(value.contextText, 600) ? { contextText: boundedString(value.contextText, 600) } : {})
  };
}

function dashboardContextModels(context: Record<string, unknown>): Record<string, unknown>[] {
  const selected = context.scope === 'component' && isRecord(context.selectedComponent)
    ? [context.selectedComponent]
    : Array.isArray(context.components) ? context.components.filter(isRecord) : [];
  const models = new Map<string, { dataSourceTableId?: string; fields: Set<string>; tableName?: string }>();
  for (const component of selected) {
    const dataSourceTableId = boundedString(component.dataSourceTableId, 160);
    const tableName = identifier(component.tableName);
    const key = dataSourceTableId ? `id:${dataSourceTableId}` : tableName ? `name:${tableName}` : null;
    if (!key) continue;
    const existing = models.get(key) ?? { fields: new Set<string>() };
    if (dataSourceTableId) existing.dataSourceTableId = dataSourceTableId;
    if (tableName) existing.tableName = tableName;
    for (const field of identifierArray(component.fields, 20)) existing.fields.add(field);
    models.set(key, existing);
  }
  return [...models.values()].slice(0, MAX_COMPONENTS).map(model => ({
    ...(model.dataSourceTableId ? { dataSourceTableId: model.dataSourceTableId } : {}),
    ...(model.tableName ? { tableName: model.tableName } : {}),
    ...(model.fields.size > 0 ? { fields: [...model.fields].slice(0, 20) } : {})
  }));
}

function dashboardCardMetricGroups(context: Record<string, unknown>): Array<{
  dataSourceTableId?: string;
  fields: string[];
  searchText: string;
  tableName?: string;
}> {
  const components = Array.isArray(context.components) ? context.components.filter(isRecord) : [];
  const groups = new Map<string, {
    dataSourceTableId?: string;
    fields: string[];
    labels: string[];
    tableName?: string;
  }>();
  for (const component of components) {
    const kind = boundedString(component.kind, 80)?.toLowerCase();
    if (kind !== 'card' && kind !== 'kpi') continue;
    const dataSourceTableId = boundedString(component.dataSourceTableId, 160);
    const tableName = identifier(component.tableName);
    const key = dataSourceTableId ? `id:${dataSourceTableId}` : tableName ? `name:${tableName}` : null;
    const primaryField = identifierArray(component.fields, 20)[0];
    if (!key || !primaryField) continue;
    const group = groups.get(key) ?? { fields: [], labels: [] };
    if (dataSourceTableId) group.dataSourceTableId = dataSourceTableId;
    if (tableName) group.tableName = tableName;
    if (!group.fields.includes(primaryField)) group.fields.push(primaryField);
    const name = boundedString(component.name, 200);
    if (name) group.labels.push(name);
    groups.set(key, group);
  }
  return [...groups.values()].slice(0, MAX_COMPONENTS).map(group => ({
    ...(group.dataSourceTableId ? { dataSourceTableId: group.dataSourceTableId } : {}),
    fields: group.fields.slice(0, 12),
    searchText: [...group.labels, group.tableName].filter(Boolean).join(' '),
    ...(group.tableName ? { tableName: group.tableName } : {})
  }));
}

function sanitizeFilter(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const id = boundedString(value.id, 160);
  const name = boundedString(value.name, 200);
  if (!id || !name) return undefined;
  const filterValue = sanitizeFilterValue(value.value, 0);
  return {
    id,
    name,
    ...(boundedString(value.field, 160) ? { field: boundedString(value.field, 160) } : {}),
    ...(boundedString(value.operator, 80) ? { operator: boundedString(value.operator, 80) } : {}),
    ...(filterValue === undefined ? {} : { value: filterValue })
  };
}

function sanitizeRecords(
  value: unknown,
  limit: number,
  sanitize: (entry: unknown) => Record<string, unknown> | undefined
): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).flatMap(entry => {
    const safe = sanitize(entry);
    return safe ? [safe] : [];
  });
}

function sanitizeFilterValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return value.trim().slice(0, 200);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean' || value === null) return value;
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 20).flatMap(entry => {
      const safe = sanitizeFilterValue(entry, depth + 1);
      return safe === undefined ? [] : [safe];
    });
  }
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).slice(0, 8).flatMap(([key, entry]) => {
    const safeKey = /^[A-Za-z0-9_-]{1,64}$/.test(key) ? key : null;
    const safeValue = sanitizeFilterValue(entry, depth + 1);
    return safeKey && safeValue !== undefined ? [[safeKey, safeValue]] : [];
  }));
}

function boundedString(value: unknown, limit: number): string | undefined {
  return readString(value)?.replace(/\s+/g, ' ').slice(0, limit);
}

function identifierArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(entry => {
    const safe = identifier(entry);
    return safe ? [safe] : [];
  }))].slice(0, limit);
}

function identifier(value: unknown): string | undefined {
  const text = readString(value);
  return text && /^[A-Za-z_][A-Za-z0-9_.$-]{0,159}$/.test(text) ? text : undefined;
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function overlapScore(left: Set<string>, right: Set<string>): number {
  return [...left].filter(token => right.has(token)).length;
}
