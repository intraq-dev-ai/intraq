import { findLocalKnowledge, localMetadataCatalog } from '@intraq/agent-core';
import type { AnalyzerPlanRequest } from '../../validation.js';
import {
  findDataSource,
  type DataSourceRecord,
  type TableDefinition
} from '../data-source/foundation-store.js';
import {
  scopedDataSourceForRead,
  type DataSourceAccessPolicy
} from '../data-source/source-access.js';
import {
  isRecord,
  readString,
  readStringArray
} from './analyzer-plan-utils.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';
import { analyzerVisibleFields } from './analyzer-plan-field-visibility.js';
import {
  derivedColumnsForTable,
  valueConceptsForTable
} from './analyzer-plan-derived-columns.js';
import {
  analyzerParameterDefinitionsForTable,
  shouldExposeAnalyzerParameterDefault
} from './analyzer-plan-parameter-values.js';
import { fieldValueResolutionForTable } from './analyzer-value-resolver.js';
import {
  DEFAULT_MODEL_CATALOG_LIMIT,
  MAX_MODEL_CATALOG_LIMIT,
  modelCatalogQuery,
  rankModelsForCatalogQuery
} from './analyzer-plan-model-catalog.js';
import {
  businessNameForTable,
  descriptionForSource,
  firstRoutingRecord,
  isAnalyzerModel,
  sampleQuestionsForTable,
  sourceSampleQuestions
} from './analyzer-plan-table-context.js';
import {
  analyzerCapabilityPromptContract,
  buildAnalyzerCapabilityManifest
} from './analyzer-capability-contract.js';
import { sanitizeAnalyzerDashboardContext } from './analyzer-dashboard-context.js';

export { listDataModelsForAnalyzer } from './analyzer-plan-model-catalog.js';
export {
  businessNameForTable,
  firstRoutingRecord,
  isAnalyzerModel
} from './analyzer-plan-table-context.js';

const MAX_RETRIEVAL_CANDIDATES = 20;

export function buildPlanLoopContext(
  request: AnalyzerPlanRequest,
  body: unknown,
  accessPolicy?: DataSourceAccessPolicy
): Record<string, unknown> {
  const rawSource = findDataSource(request.dataSourceId);
  const source = rawSource && accessPolicy ? scopedDataSourceForRead(rawSource, accessPolicy) ?? undefined : rawSource;
  const models = source?.tables.filter(isAnalyzerModel) ?? [];
  const bodyRecord = isRecord(body) ? body : {};
  const retrievalCandidates = retrievalCandidateContext(source, bodyRecord, models, request.question);
  const retrievedKnowledgeReferences = findLocalKnowledge(request.question)
    .slice(0, 4)
    .map(knowledgeReferenceContext);
  return {
    request: {
      dataSourceId: request.dataSourceId,
      conversationId: request.conversationId ?? null,
      provider: request.provider ?? null,
      question: request.question
    },
    body: sanitizedPlanLoopBody(bodyRecord),
    runtimeDate: analyzerRuntimeDateContext(),
    analyzerInstructions: readStringArray(bodyRecord.analyzerInstructions),
    ...(retrievalCandidates ? { retrievalCandidates } : {}),
    retrievedKnowledgeReferences,
    availableKnowledgeReferences: localMetadataCatalog.map(knowledgeReferenceContext),
    dashboardBuilderActionPlanSchema: {
      type: 'action-plan',
      mode: 'create',
      componentTypes: ['chart', 'table', 'card', 'pie', 'matrix', 'filter'],
      requiredAnalyzerCreateAction: 'create_table',
      actionShape: { action: 'string', params: 'object' }
    },
    selectedDataSource: source ? {
      id: source.id,
      name: source.name,
      description: descriptionForSource(source),
      sampleQuestions: sourceSampleQuestions(source, models).slice(0, 5),
      modelCount: models.length,
      aiReadyModels: models.slice(0, 8).map(table => {
        const routing = firstRoutingRecord(table);
        return {
          id: table.id,
          name: table.name,
          businessName: businessNameForTable(table),
          description: table.description,
          businessPurpose: readString(table.dictionary.businessPurpose),
          sampleQuestions: sampleQuestionsForTable(table).slice(0, 3),
          aiWhenToUse: readString(isRecord(table.dictionary.ai) ? table.dictionary.ai.whenToUse : undefined),
          aiUseFor: readStringArray(routing.useFor).slice(0, 5)
        };
      }),
      modelCatalog: {
        pageSize: DEFAULT_MODEL_CATALOG_LIMIT,
        maxPageSize: MAX_MODEL_CATALOG_LIMIT,
        retrieval: retrievalCandidates
          ? 'retrievalCandidates.models is a validated shortlist for this selected data source. For business analysis, call get_schema directly only when retrievalCandidates.directSchemaCandidate is present; otherwise call list_data_models.'
          : 'Search the AI-ready routing catalog with list_data_models. Load full fields only with get_schema after choosing one model.'
      }
    } : null
  };
}

function knowledgeReferenceContext(
  reference: typeof localMetadataCatalog[number]
): Record<string, unknown> {
  return {
    id: reference.id,
    title: reference.title,
    domain: reference.domain,
    summary: reference.summary,
    tags: reference.tags,
    ...(reference.metricFields.length > 0 ? { metricFields: reference.metricFields } : {}),
    ...(reference.recommendedVisualizations.length > 0
      ? { recommendedVisualizations: reference.recommendedVisualizations }
      : {})
  };
}

function sanitizedPlanLoopBody(body: Record<string, unknown>): Record<string, unknown> {
  const {
    dashboardContext: rawDashboardContext,
    pgvectorCandidates: _pgvectorCandidates,
    ...safeBody
  } = body;
  const dashboardContext = sanitizeAnalyzerDashboardContext(rawDashboardContext);
  return {
    ...safeBody,
    ...(dashboardContext ? { dashboardContext } : {})
  };
}

function retrievalCandidateContext(
  source: DataSourceRecord | undefined,
  body: Record<string, unknown>,
  models: TableDefinition[],
  question: string
): Record<string, unknown> | null {
  if (!source) return null;
  const candidateSource = isRecord(body.pgvectorCandidates) ? body.pgvectorCandidates : null;
  const candidateInputs = Array.isArray(candidateSource?.candidates) ? candidateSource.candidates : [];
  if (candidateInputs.length === 0) return null;

  const byId = new Map(models.map(table => [table.id, table]));
  const byName = new Map(models.map(table => [table.name, table]));
  const seen = new Set<string>();
  const candidates: Record<string, unknown>[] = [];

  for (let index = 0; index < candidateInputs.length && candidates.length < MAX_RETRIEVAL_CANDIDATES; index += 1) {
    const input = candidateInputs[index];
    if (!isRecord(input)) continue;
    const tableId = readString(input.id);
    const tableName = readString(input.name);
    const table = (tableId ? byId.get(tableId) : undefined) ?? (tableName ? byName.get(tableName) : undefined);
    if (!table || seen.has(table.id)) continue;
    seen.add(table.id);
    const distance = finiteNumber(input.distance);
    const routingExampleMatch = input.routingExampleMatch === true;
    const matchedRoutingExample = readString(input.matchedRoutingExample);
    candidates.push({
      id: table.id,
      name: table.name,
      businessName: businessNameForTable(table),
      rank: index + 1,
      ...(routingExampleMatch ? { routingExampleMatch: true } : {}),
      ...(matchedRoutingExample ? { matchedRoutingExample } : {}),
      ...(distance === null ? {} : { distance })
    });
  }

  if (candidates.length === 0) return null;
  const directSchemaCandidate = aiReadyRoutingShortcutCandidate(candidateSource, candidates)
    ?? (directSchemaShortcutEnabled(candidateSource)
    ? directSchemaCandidateForQuestion(models, candidates, question)
    : null);
  return {
    source: readString(candidateSource?.source) ?? 'postgres-pgvector',
    instruction: directSchemaCandidate
      ? directSchemaCandidate.reason === AI_READY_ROUTING_EXAMPLE_MATCH_REASON
        ? 'Rank 1 matched an exact AI-ready routing example. Load directSchemaCandidate first; do not call list_data_models before trying it. Prefer it unless its schema cannot answer the requested fields.'
        : 'Use directSchemaCandidate only if it safely answers the question; otherwise call list_data_models.'
      : 'Use these as a candidate shortlist only. Direct schema shortcut is not enabled or was not validated, so call list_data_models before selecting a model.',
    dataSourceId: source.id,
    ...(directSchemaCandidate ? { directSchemaCandidate } : {}),
    models: directSchemaCandidate?.reason === AI_READY_ROUTING_EXAMPLE_MATCH_REASON
      ? candidates.slice(0, 1)
      : candidates
  };
}

function directSchemaShortcutEnabled(candidateSource: Record<string, unknown> | null): boolean {
  return candidateSource?.allowDirectSchemaShortcut === true || candidateSource?.directSchemaShortcut === true;
}

const AI_READY_ROUTING_EXAMPLE_MATCH_REASON = 'The rank 1 retrieval candidate matched an exact AI-ready routing example.';

function aiReadyRoutingShortcutCandidate(
  candidateSource: Record<string, unknown> | null,
  candidates: Record<string, unknown>[]
): Record<string, unknown> | null {
  if (candidateSource?.allowAiReadyRoutingShortcut !== true) return null;
  const top = candidates[0];
  if (!top || top.rank !== 1 || top.routingExampleMatch !== true) return null;
  return {
    id: top.id,
    name: top.name,
    businessName: top.businessName,
    candidateRank: 1,
    matchedRoutingExample: top.matchedRoutingExample,
    reason: AI_READY_ROUTING_EXAMPLE_MATCH_REASON,
    trustedRoutingExampleMatch: true
  };
}

function directSchemaCandidateForQuestion(
  models: TableDefinition[],
  candidates: Record<string, unknown>[],
  question: string
): Record<string, unknown> | null {
  const catalogTop = rankModelsForCatalogQuery(models, modelCatalogQuery('', question))[0]?.table;
  if (!catalogTop) return null;
  const candidateRank = candidates.find(candidate => readString(candidate.id) === catalogTop.id)?.rank;
  if (candidateRank !== 1) return null;
  return {
    id: catalogTop.id,
    name: catalogTop.name,
    businessName: businessNameForTable(catalogTop),
    candidateRank,
    reason: 'The AI-ready routing catalog top match and retrieval top candidate agree.'
  };
}

export function getSchemaForAnalyzer(
  dataSourceId: string,
  args: Record<string, unknown>,
  accessPolicy?: DataSourceAccessPolicy
): Record<string, unknown> {
  const rawSource = findDataSource(dataSourceId);
  const source = rawSource && accessPolicy ? scopedDataSourceForRead(rawSource, accessPolicy) ?? undefined : rawSource;
  const table = source ? resolveTable(source, args) : null;
  if (!source || !table || !isAnalyzerModel(table)) {
    return {
      success: false,
      error: 'Selected data model schema was not found.',
      dataSourceId,
      tableId: readString(args.tableId),
      tableName: readString(args.tableName)
    };
  }
  return schemaForTable(source, table);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function schemaForTable(source: DataSourceRecord, table: TableDefinition): Record<string, unknown> {
  const routing = firstRoutingRecord(table);
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const fields = analyzerVisibleFields(table);
  return {
    success: true,
    dataSourceId: source.id,
    tableId: table.id,
    tableName: table.name,
    fields: fields.map(field => {
      const metadata = analyzerFieldMetadata(table, field.name);
      const valueResolution = fieldValueResolutionForTable(table, field);
      return {
        name: field.name,
        type: field.type,
        columnType: readString(metadata.columnType) ?? readString(metadata.role) ?? field.type,
        description: field.description,
        dictionaryDescription: field.dictionaryDescription,
        businessName: readString(metadata.businessName) ?? readString(metadata.label),
        format: readString(metadata.format) ?? readString(metadata.unit),
        synonyms: readStringArray(metadata.synonyms),
        valueResolution
      };
    }),
    derivedColumns: derivedColumnsForTable(table).map(column => ({
      name: column.name,
      businessName: column.businessName,
      columnType: column.columnType,
      description: column.description,
      formula: column.formula,
      outputFormat: column.outputFormat,
      sourceFields: column.sourceFields,
      synonyms: column.synonyms,
      type: column.type
    })),
    valueConcepts: valueConceptsForTable(table),
    parameters: analyzerParameterDefinitionsForTable(table).map(parameter => ({
      name: parameter.name,
      required: parameter.required !== false,
      ...(parameter.dataType ? { dataType: parameter.dataType } : {}),
      ...(parameter.dateRole ? { dateRole: parameter.dateRole } : {}),
      ...(parameter.defaultValue && shouldExposeAnalyzerParameterDefault(parameter) ? { defaultValue: parameter.defaultValue } : {})
    })),
    businessName: businessNameForTable(table),
    businessPurpose: readString(dictionary.businessPurpose),
    sampleQuestions: sampleQuestionsForTable(table),
    keyMetrics: readStringArray(dictionary.keyMetrics).concat(readStringArray(ai.keyMetrics)),
    aiWhenToUse: readString(ai.whenToUse),
    aiDomain: readString(routing.domain),
    aiGrain: readString(routing.grain),
    aiPrimaryTimeField: readString(routing.primaryTimeField),
    aiTriggerKeywords: readStringArray(routing.triggerKeywords),
    aiUseFor: readStringArray(routing.useFor),
    aiNotFor: readStringArray(routing.notFor),
    aiNanoCard: readString(routing.nanoCard),
    aiExampleQuestions: readStringArray(routing.exampleQuestions).concat(readStringArray(ai.sampleQuestions)),
    capabilityContract: analyzerCapabilityPromptContract(buildAnalyzerCapabilityManifest(source, table))
  };
}

function analyzerRuntimeDateContext(): Record<string, string> {
  return {
    currentDate: new Date().toISOString().slice(0, 10),
    dateFormat: 'YYYY-MM-DD',
    timeZone: 'UTC'
  };
}

function resolveTable(source: DataSourceRecord, args: Record<string, unknown>): TableDefinition | null {
  const tableId = readString(args.tableId);
  const tableName = readString(args.tableName);
  return source.tables.find(table => table.id === tableId || table.name === tableName) ?? null;
}
