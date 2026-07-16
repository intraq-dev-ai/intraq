import {
  findDataSource,
  type TableDefinition
} from '../data-source/foundation-store.js';
import {
  modelCatalogQuery,
  rankModelsForCatalogQuery
} from './analyzer-plan-model-catalog.js';
import {
  businessNameForTable,
  firstRoutingRecord,
  isAnalyzerModel,
  sampleQuestionsForTable
} from './analyzer-plan-table-context.js';
import {
  isRecord,
  readString,
  readStringArray
} from './analyzer-plan-utils.js';
import { analyzerDashboardRoutingCandidates } from './analyzer-dashboard-context.js';

const MAX_SERVER_ROUTING_CANDIDATES = 20;

export function withServerAnalyzerRoutingCandidates(
  dataSourceId: string,
  question: string,
  body: Record<string, unknown>
): Record<string, unknown> {
  const contextualCandidates = analyzerDashboardRoutingCandidates(body.dashboardContext);
  const clientAndContextCandidates = mergeAnalyzerRoutingCandidateSources(
    body.pgvectorCandidates,
    contextualCandidates
  );
  const candidates = mergeAnalyzerRoutingCandidateSources(
    clientAndContextCandidates,
    buildServerAnalyzerRoutingCandidates(dataSourceId, question)
  );
  return candidates ? { ...body, pgvectorCandidates: candidates } : body;
}

export function buildServerAnalyzerRoutingCandidates(
  dataSourceId: string,
  question: string
): Record<string, unknown> | null {
  const source = findDataSource(dataSourceId);
  const models = source?.tables.filter(isAnalyzerModel) ?? [];
  if (models.length === 0) return null;

  const ranked = rankModelsForCatalogQuery(models, modelCatalogQuery('', question))
    .slice(0, MAX_SERVER_ROUTING_CANDIDATES);
  if (ranked.length === 0) return null;

  return {
    allowDirectSchemaShortcut: true,
    allowAiReadyRoutingShortcut: true,
    source: 'server-routing-catalog',
    candidates: ranked.map(({ score, table }, index) => candidateForTable(table, question, score, index + 1))
  };
}

export function mergeAnalyzerRoutingCandidateSources(
  externalSource: unknown,
  serverSource: Record<string, unknown> | null
): Record<string, unknown> | null {
  const external = isRecord(externalSource) ? externalSource : null;
  const externalCandidates = candidateRecords(external?.candidates);
  const serverCandidates = candidateRecords(serverSource?.candidates);
  if (externalCandidates.length === 0) return serverSource;
  if (serverCandidates.length === 0) return external;

  const externalRecord = external ?? {};
  const externalTop = externalCandidates[0] as Record<string, unknown>;
  const serverTop = serverCandidates[0] as Record<string, unknown>;
  const serverTopExactMatch = serverTop?.routingExampleMatch === true;
  const topSourcesAgree = Boolean(externalTop && serverTop && candidateKey(externalTop) === candidateKey(serverTop));
  const orderedCandidates = serverTopExactMatch
    ? uniqueCandidates([...serverCandidates, ...externalCandidates])
    : topSourcesAgree
      ? uniqueCandidates([externalTop, ...serverCandidates, ...externalCandidates.slice(1)])
      : uniqueCandidates([...externalCandidates, ...serverCandidates]);

  return {
    ...externalRecord,
    allowDirectSchemaShortcut: true,
    allowAiReadyRoutingShortcut: true,
    source: 'combined-retrieval-candidates',
    sources: [
      readString(externalRecord.source) ?? 'external-retrieval-candidates',
      readString(serverSource?.source) ?? 'server-routing-catalog'
    ],
    candidates: orderedCandidates
  };
}

function candidateForTable(
  table: TableDefinition,
  question: string,
  routingScore: number,
  rank: number
): Record<string, unknown> {
  const exactExample = exactRoutingExampleForQuestion(table, question);
  return {
    id: table.id,
    name: table.name,
    businessName: businessNameForTable(table),
    routingScore,
    rank,
    ...(exactExample ? {
      matchedRoutingExample: exactExample,
      routingExampleMatch: true
    } : {})
  };
}

function exactRoutingExampleForQuestion(table: TableDefinition, question: string): string | null {
  const normalizedQuestion = normalizeComparableText(question);
  if (!normalizedQuestion) return null;
  const routing = firstRoutingRecord(table);
  const examples = [
    ...readStringArray(routing.exampleQuestions),
    ...sampleQuestionsForTable(table)
  ];
  return examples.find(example => normalizeComparableText(example) === normalizedQuestion) ?? null;
}

function candidateRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function uniqueCandidates(candidates: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique.slice(0, MAX_SERVER_ROUTING_CANDIDATES);
}

function candidateKey(candidate: Record<string, unknown> | undefined): string | null {
  if (!candidate) return null;
  const id = readString(candidate.id);
  if (id) return `id:${id}`;
  const name = readString(candidate.name);
  return name ? `name:${name}` : null;
}

function normalizeComparableText(value: string): string {
  const text = readString(value);
  if (!text) return '';
  let normalized = '';
  let lastWasSpace = true;
  for (const character of text.toLowerCase()) {
    const tokenCharacter = isComparableTokenCharacter(character);
    if (tokenCharacter) {
      normalized += character;
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      normalized += ' ';
      lastWasSpace = true;
    }
  }
  return normalized.trim();
}

function isComparableTokenCharacter(character: string): boolean {
  return character >= 'a' && character <= 'z' || character >= '0' && character <= '9';
}
