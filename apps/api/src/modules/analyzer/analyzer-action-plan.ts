import type {
  ActionPlanStep,
  DashboardActionPlan,
  DashboardComponentType,
  KnowledgeReference
} from '@intraq/contracts';
import type { AnalyzerPlanRequest } from '../../validation.js';
import {
  findDataSource,
  toLabel,
  type FieldDefinition,
  type TableDefinition
} from '../data-source/foundation-store.js';
import {
  isRecord,
  modelIdentityScore,
  quoteIdentifier,
  readString,
  readStringArray,
  routingRecordsFor,
  weightedTermsFor,
  weightedTermScore
} from './analyzer-planning-utils.js';

type AnalyzerAggregation = 'avg' | 'count' | 'max' | 'min' | 'none' | 'sum';
type AnalyzerFieldRole = 'dimension' | 'identifier' | 'measure' | 'time';

interface AnalyzerActionColumn {
  field: string;
  summarize: AnalyzerAggregation;
}

export interface AnalyzerSelectedModel {
  id: string;
  name: string;
  businessName: string;
  domain?: string | null;
  grain?: string | null;
  primaryTimeField?: string | null;
  dimensions: string[];
  metrics: string[];
}

export interface AnalyzerActionPlanResponse extends DashboardActionPlan {
  success: true;
  type: 'action-plan';
  mode: 'create';
  provider: 'intraq';
  requester: 'ai-data-analyzer';
  componentType: DashboardComponentType;
  actions: ActionPlanStep[];
  message: string;
  intentDetails: {
    question: string;
    knowledgeReferences: KnowledgeReference[];
    selectedModel: AnalyzerSelectedModel | null;
    selectedModels?: AnalyzerSelectedModel[];
    sql: string;
    insightGuidance: string[];
  };
}

export function buildAnalyzerActionPlan(
  request: AnalyzerPlanRequest,
  knowledgeReferences: KnowledgeReference[]
): AnalyzerActionPlanResponse {
  const source = findDataSource(request.dataSourceId);
  const table = source ? selectedTableForRequest(source.tables, request) : null;
  const columns = table ? columnsForTable(table, request.question) : [];
  const selectedModel = table && columns.length > 0 ? selectedModelFor(table, columns) : null;
  if (!table || columns.length === 0 || !selectedModel) {
    return clarificationPlan(request, knowledgeReferences, table?.name ?? null);
  }
  const sql = buildSql(table.name, columns);
  const title = selectedModel.businessName;
  const insightGuidance = [
    `Answer "${request.question}" using ${title}.`,
    'Cite the selected data model and fields used.',
    'Ask for clarification instead of inventing missing fields, joins, metrics, or time grains.'
  ];

  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType: 'table',
    params: {
      element: { clientElementId: 'analyzer-result' },
      dataSourceId: request.dataSourceId,
      dataSourceTableId: table.id,
      tableName: table.name
    },
    actions: [{
      action: 'create_table',
      params: {
        title,
        columns,
        dataSource: request.dataSourceId,
        _dataSourceId: request.dataSourceId,
        _tableName: table.name,
        sql,
        insightPrompt: insightGuidance.join(' ')
      }
    }],
    message: `I selected ${title} because its metadata best matches this question.`,
    intentDetails: {
      question: request.question,
      knowledgeReferences,
      selectedModel,
      sql,
      insightGuidance
    }
  };
}

function clarificationPlan(
  request: AnalyzerPlanRequest,
  knowledgeReferences: KnowledgeReference[],
  tableName: string | null
): AnalyzerActionPlanResponse {
  const message = tableName
    ? `The selected model "${tableName}" needs readable measure or dimension metadata before Analyzer can answer this question.`
    : 'Analyzer needs a selected data source and data model context before it can answer this question.';
  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType: 'table',
    params: {
      element: { clientElementId: 'analyzer-result' },
      dataSourceId: request.dataSourceId,
      ...(tableName ? { tableName } : {})
    },
    actions: [{
      action: 'request_clarification',
      params: {
        reason: message,
        question: request.question,
        dataSourceId: request.dataSourceId
      }
    }],
    message,
    intentDetails: {
      question: request.question,
      knowledgeReferences,
      selectedModel: null,
      sql: '',
      insightGuidance: [
        'Choose a data model with business names, descriptions, dimensions, and measures.',
        'Ask the question again after the model context is available.'
      ]
    }
  };
}

function selectedTableForRequest(tables: TableDefinition[], request: AnalyzerPlanRequest): TableDefinition | null {
  const explicit = request.dataSourceTableId ?? request.tableName;
  if (explicit) {
    const match = tables.find(table => table.id === explicit || table.name === explicit);
    if (match) return match;
  }
  const candidates = tables.filter(table => table.isSelected !== false);
  const scored = candidates.map((table, index) => ({
    index,
    score: tableScore(table, request.question),
    table
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  return scored[0]?.table ?? candidates[0] ?? null;
}

function tableScore(table: TableDefinition, question: string): number {
  const dictionary = table.dictionary;
  const ai = isRecord(dictionary.ai) ? dictionary.ai : {};
  const routing = routingRecordsFor(dictionary);
  const identityScore = modelIdentityScore(question, [
    table.name,
    dictionary.businessName,
    dictionary.description,
    ...routing.flatMap(record => [record.domain, record.grain])
  ]);
  const weightedTerms = [
    ...weightedTermsFor(4, [
      dictionary.businessName,
      dictionary.businessPurpose,
      ai.whenToUse,
      ...readStringArray(dictionary.sampleQuestions),
      ...readStringArray(ai.sampleQuestions)
    ]),
    ...weightedTermsFor(2, [
      dictionary.description,
      table.description,
      ...routing.flatMap(record => [
        record.domain,
        record.grain,
        ...readStringArray(record.triggerKeywords),
        ...readStringArray(record.useFor),
        ...readStringArray(record.exampleQuestions)
      ])
    ]),
    ...weightedTermsFor(1, [
      table.name,
      ...table.fields.flatMap(field => [
        field.name.replaceAll('_', ' '),
        field.label,
        field.description,
        field.dictionaryDescription,
        ...readStringArray(field.aliases),
        ...readStringArray(field.synonyms)
      ])
    ])
  ];
  const metadataBonus = table.settings?.isDataModel === true ? 2 : 0;
  return metadataBonus + identityScore + weightedTerms.reduce((score, term) => score + weightedTermScore(question, term.value, term.weight), 0);
}

function columnsForTable(table: TableDefinition, question: string): AnalyzerActionColumn[] {
  const fields = table.fields.filter(field => !field.analyzerHidden && !field.hiddenFromAnalyzer);
  const timeField = primaryTimeFieldFor(table, fields);
  const measures = fields.filter(field => fieldRole(field) === 'measure');
  const dimensions = fields.filter(field => fieldRole(field) === 'dimension');
  const selectedMeasures = selectFields(question, measures).slice(0, 3);
  const selectedDimensions = selectFields(question, dimensions).slice(0, 3);
  const fallbackMeasure = selectedMeasures.length > 0 ? [] : measures.slice(0, 1);
  const fallbackDimensions = selectedDimensions.length > 0 ? [] : dimensions.slice(0, 2);
  const names = new Set<string>();
  return [
    ...(timeField ? [{ field: timeField.name, summarize: 'none' as const }] : []),
    ...[...selectedDimensions, ...fallbackDimensions].map(field => ({ field: field.name, summarize: 'none' as const })),
    ...[...selectedMeasures, ...fallbackMeasure].map(field => ({ field: field.name, summarize: aggregationFor(field) }))
  ].filter(column => {
    if (names.has(column.field)) return false;
    names.add(column.field);
    return true;
  }).slice(0, 8);
}

function selectFields(question: string, fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((field, index) => ({
    field,
    index,
    score: fieldScore(question, field)
  })).filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(item => item.field);
}

function fieldScore(question: string, field: FieldDefinition): number {
  return [
    field.name.replaceAll('_', ' '),
    field.label,
    field.description,
    field.dictionaryDescription,
    field.role,
    field.semanticRole,
    field.columnType,
    ...readStringArray(field.aliases),
    ...readStringArray(field.synonyms)
  ].reduce((score, term) => score + weightedTermScore(question, term ?? '', 1), 0);
}

function selectedModelFor(table: TableDefinition, columns: AnalyzerActionColumn[]): AnalyzerSelectedModel {
  const routing = routingRecordsFor(table.dictionary)[0] ?? {};
  return {
    id: table.id,
    name: table.name,
    businessName: readString(table.dictionary.businessName) ?? toLabel(table.name),
    domain: readString(routing.domain) ?? 'generic',
    grain: readString(routing.grain),
    primaryTimeField: primaryTimeFieldFor(table, table.fields)?.name ?? null,
    dimensions: columns.filter(column => column.summarize === 'none').map(column => column.field),
    metrics: columns.filter(column => column.summarize !== 'none').map(column => column.field)
  };
}

function primaryTimeFieldFor(table: TableDefinition, fields: FieldDefinition[]): FieldDefinition | null {
  const routing = routingRecordsFor(table.dictionary).find(record => typeof record.primaryTimeField === 'string') ?? {};
  const routed = readString(routing.primaryTimeField);
  if (routed) return fields.find(field => field.name === routed) ?? null;
  return fields.find(field => fieldRole(field) === 'time') ?? null;
}

function fieldRole(field: FieldDefinition): AnalyzerFieldRole {
  const explicit = readString(field.columnType) ?? readString(field.role) ?? readString(field.semanticRole);
  if (explicit === 'measure' || explicit === 'metric') return 'measure';
  if (explicit === 'time' || explicit === 'date') return 'time';
  if (explicit === 'identifier') return 'identifier';
  if (explicit === 'dimension' || explicit === 'filter' || explicit === 'attribute') return 'dimension';
  if (/date|time/i.test(`${field.name} ${field.type}`)) return 'time';
  return /number|numeric|decimal|float|double|int/i.test(field.type) ? 'measure' : 'dimension';
}

function aggregationFor(field: FieldDefinition): AnalyzerAggregation {
  const text = `${field.name} ${field.label ?? ''} ${field.description} ${field.dictionaryDescription}`.toLowerCase();
  if (/\b(count|qty|quantity|orders|users|rows)\b/.test(text)) return 'sum';
  if (/\b(avg|average|rate|percent|percentage|ratio)\b/.test(text)) return 'avg';
  return 'sum';
}

function buildSql(tableName: string, columns: AnalyzerActionColumn[]): string {
  const selected = columns.map(column => quoteIdentifier(column.field)).join(', ');
  return `SELECT ${selected || '*'} FROM ${quoteIdentifier(tableName)} LIMIT 100`;
}
