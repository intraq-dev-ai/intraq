import {
  findDataSource,
  type DataSourceRecord,
  type TableDefinition
} from '../data-source/foundation-store.js';
import {
  isRecord,
  normalizeForSearch,
  readString,
  readStringArray,
  routingRecordsFor,
  weightedTermsFor
} from '../analyzer/analyzer-planning-utils.js';
import type { SqlEditorDataSource, SqlEditorTable } from './sql-editor-data.js';
import { linkedTablesFor, rawTableLinkMap, type LinkedTable } from './sql-assistant-table-links.js';

const DEFAULT_TABLE_CATALOG_LIMIT = 18;
const MAX_TABLE_CATALOG_LIMIT = 40;
const DIRECT_MATCH_RATIO = 0.65;
const MIN_DIRECT_MATCHES = 8;
const LINKED_TABLES_PER_MATCH = 6;
const LINK_EXPANSION_SEEDS = 8;

interface ScoredTable {
  domain: string | null;
  index: number;
  linkedFrom: string[];
  score: number;
  table: SqlEditorTable;
  tableDefinition: TableDefinition | null;
}

export function listSqlAssistantTables(
  source: SqlEditorDataSource,
  args: Record<string, unknown>,
  fallbackQuery: string
): Record<string, unknown> {
  const query = readString(args.query) ?? fallbackQuery;
  const requestedDomain = readString(args.domain);
  const targetType = 'raw_table';
  const limit = readTableLimit(args.limit);
  const sourceRecord = findDataSource(source.id);
  const suggestedDomains = requestedDomain ? [requestedDomain] : [];
  const matches = rankTables(source, sourceRecord, query, suggestedDomains, targetType);
  const linkMap = rawTableLinkMap(sourceRecord);
  const page = expandWithLinkedTables(source, sourceRecord, matches, linkMap, query, suggestedDomains, limit);

  return {
    query,
    requestedDomain: requestedDomain ?? null,
    targetType,
    suggestedDomains,
    limit,
    totalTables: source.tables.length,
    totalMatches: matches.length,
    returnedTables: page.length,
    truncated: matches.length > page.length,
    tables: page.map(item => tableSummary(item, linkMap))
  };
}

function rankTables(
  source: SqlEditorDataSource,
  sourceRecord: DataSourceRecord | undefined,
  query: string,
  suggestedDomains: string[],
  targetType: SqlEditorTable['targetType'] | null
): ScoredTable[] {
  const hasQuery = normalizeForSearch(query).length > 0;
  const domainSet = new Set(suggestedDomains);
  const scopedTables = targetType ? source.tables.filter(table => table.targetType === targetType) : source.tables;
  const scored = scopedTables.map((table, index) => {
    const tableDefinition = tableDefinitionFor(sourceRecord, table);
    const domain = routingDomainFor(tableDefinition);
    const domainScore = domain && domainSet.has(domain) ? 60 : 0;
    return {
      domain,
      index,
      linkedFrom: [],
      score: domainScore + tableSearchScore(table, tableDefinition, query),
      table,
      tableDefinition
    };
  });
  const filtered = scored.filter(item => {
    if (domainSet.size > 0) return item.score > 0 || Boolean(item.domain && domainSet.has(item.domain));
    return !hasQuery || item.score > 0;
  });
  return filtered.sort((left, right) => right.score - left.score || left.index - right.index);
}

function expandWithLinkedTables(
  source: SqlEditorDataSource,
  sourceRecord: DataSourceRecord | undefined,
  matches: ScoredTable[],
  linkMap: Map<string, LinkedTable[]>,
  query: string,
  suggestedDomains: string[],
  limit: number
): ScoredTable[] {
  const directLimit = Math.min(limit, matches.length, Math.max(MIN_DIRECT_MATCHES, Math.floor(limit * DIRECT_MATCH_RATIO)));
  const selected = new Map<string, ScoredTable>();
  for (const item of matches.slice(0, directLimit)) selected.set(item.table.name, item);

  for (const seed of matches.slice(0, LINK_EXPANSION_SEEDS)) {
    for (const link of linkedTablesFor(seed.table.name, linkMap, LINKED_TABLES_PER_MATCH)) {
      if (selected.size >= limit) break;
      const linked = scoredTableForName(source, sourceRecord, link.name, query, suggestedDomains);
      if (!linked) continue;
      selected.set(linked.table.name, {
        ...linked,
        linkedFrom: [...linked.linkedFrom, `${seed.table.name} via ${link.via}`]
      });
    }
  }

  for (const item of matches) {
    if (selected.size >= limit) break;
    if (!selected.has(item.table.name)) selected.set(item.table.name, item);
  }
  return Array.from(selected.values());
}

function scoredTableForName(
  source: SqlEditorDataSource,
  sourceRecord: DataSourceRecord | undefined,
  name: string,
  query: string,
  suggestedDomains: string[]
): ScoredTable | null {
  const index = source.tables.findIndex(table => table.name === name && table.targetType === 'raw_table');
  const table = source.tables[index];
  if (!table) return null;
  const tableDefinition = tableDefinitionFor(sourceRecord, table);
  const domain = routingDomainFor(tableDefinition);
  const domainScore = domain && suggestedDomains.includes(domain) ? 60 : 0;
  return {
    domain,
    index,
    linkedFrom: [],
    score: domainScore + tableSearchScore(table, tableDefinition, query),
    table,
    tableDefinition
  };
}

function tableSummary(item: ScoredTable, linkMap: Map<string, LinkedTable[]>): Record<string, unknown> {
  return {
    name: item.table.name,
    domain: item.domain,
    targetType: item.table.targetType,
    isDataModel: item.table.isDataModel,
    hasSqlQuery: item.table.hasSqlQuery,
    description: item.table.description || item.tableDefinition?.description || null,
    rowCount: item.table.rowCount ?? null,
    linkedFrom: item.linkedFrom,
    linkedTables: linkedTablesFor(item.table.name, linkMap, LINKED_TABLES_PER_MATCH)
  };
}

function tableSearchScore(table: SqlEditorTable, tableDefinition: TableDefinition | null, query: string): number {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return 0;
  const dictionary = tableDefinition?.dictionary ?? {};
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const routing = routingRecordsFor(dictionary);
  const weightedTerms = [
    ...weightedTermsFor(10, routing.flatMap(record => [
      record.domain,
      ...readStringArray(record.triggerKeywords),
      ...readStringArray(record.useFor),
      ...readStringArray(record.exampleQuestions)
    ])),
    ...weightedTermsFor(6, [
      dictionary.businessName,
      dictionary.businessPurpose,
      ai.whenToUse,
      table.name
    ]),
    ...weightedTermsFor(3, [
      dictionary.description,
      table.description,
      ...routing.flatMap(record => [record.grain, record.nanoCard])
    ]),
    ...weightedTermsFor(1, [
      ...table.columns.flatMap(column => [column.name, column.label, column.description])
    ])
  ];
  return weightedTerms.reduce((score, term) => score + catalogTermScore(normalizedQuery, term.value, term.weight), 0);
}

function catalogTermScore(normalizedQuery: string, value: string, weight: number): number {
  const normalizedTerm = normalizeForSearch(value);
  if (!normalizedTerm) return 0;
  if (normalizedQuery.includes(normalizedTerm)) return weight * (normalizedTerm.includes(' ') ? 3 : 2);
  const queryTokens = new Set(normalizedQuery.split(/\s+/).filter(Boolean));
  const termTokens = normalizedTerm.split(/\s+/).filter(token => token.length > 2);
  const matches = termTokens.filter(token => queryTokens.has(token)).length;
  if (matches === 0) return 0;
  return matches === termTokens.length ? weight * 2 : weight;
}

function routingDomainFor(tableDefinition: TableDefinition | null): string | null {
  const routing = routingRecordsFor(tableDefinition?.dictionary ?? {}).find(record => typeof record.domain === 'string');
  return readString(routing?.domain);
}

function tableDefinitionFor(source: DataSourceRecord | undefined, table: SqlEditorTable): TableDefinition | null {
  return source?.tables.find(item => item.name === table.name) ?? null;
}

function readTableLimit(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : DEFAULT_TABLE_CATALOG_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_TABLE_CATALOG_LIMIT);
}
