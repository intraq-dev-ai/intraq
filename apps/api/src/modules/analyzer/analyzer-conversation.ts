import type { AnalyzerResult } from '@intraq/contracts';
import type { AnalyzerPlanRequest } from '../../validation.js';
import {
  analyzerInstructionAnswer,
  analyzerInstructionFollowUps,
  normalizeAnalyzerInstruction
} from './analyzer-instructions.js';
import { isAiReadyDataModel } from '../data-source/ai-ready-data-model.js';
import {
  findDataSource,
  toLabel,
  type DataSourceRecord,
  type TableDefinition
} from '../data-source/foundation-store.js';
import {
  isRecord,
  readString,
  readStringArray,
  uniqueStrings
} from './analyzer-plan-utils.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';

const defaultAnalyzerConversationFollowUps = [
  'What can I analyze in the selected data source?',
  'Show me the most important trends in this data.',
  'Build a dashboard-ready summary from the AI-ready data models.'
];

const defaultAnalyzerConversationAnswer = [
  'Hi. Select a data source and I can explain what it contains, answer business questions from AI-ready data models,',
  'and help prepare dashboard-ready outputs.'
].join(' ');

export function buildAnalyzerConversationResult(
  question: string,
  answer?: string | null,
  suggestedFollowUps?: string[],
  dataSourceId?: string
): AnalyzerResult {
  return {
    workflow: 'analyzer',
    answer: conversationAnswer(answer, dataSourceId),
    suggestedFollowUps: conversationFollowUps(suggestedFollowUps, dataSourceId),
    knowledgeReferences: []
  };
}

export function buildAnalyzerConversationPlan(
  request: AnalyzerPlanRequest,
  answer?: string | null,
  suggestedFollowUps?: string[]
): AnalyzerActionPlanResponse {
  const response = conversationAnswer(answer, request.dataSourceId);
  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType: 'table',
    params: {
      element: { clientElementId: 'analyzer-conversation' },
      dataSourceId: request.dataSourceId
    },
    actions: [{
      action: 'answer_conversation',
      params: {
        reason: response,
        question: request.question,
        dataSourceId: request.dataSourceId
      }
    }],
    message: response,
    intentDetails: {
      question: request.question,
      knowledgeReferences: [],
      selectedModel: null,
      sql: '',
      insightGuidance: conversationFollowUps(suggestedFollowUps, request.dataSourceId)
    }
  };
}

export function buildAnalyzerInstructionPlan(
  request: AnalyzerPlanRequest,
  instructionInput?: string | null,
  suggestedFollowUps?: string[]
): AnalyzerActionPlanResponse {
  const instruction = normalizeAnalyzerInstruction(instructionInput ?? request.question);
  const response = analyzerInstructionAnswer(instruction);
  return {
    success: true,
    type: 'action-plan',
    mode: 'create',
    provider: 'intraq',
    requester: 'ai-data-analyzer',
    componentType: 'table',
    params: {
      element: { clientElementId: 'analyzer-instruction' },
      dataSourceId: request.dataSourceId
    },
    actions: [{
      action: 'answer_conversation',
      params: {
        reason: response,
        question: request.question,
        dataSourceId: request.dataSourceId,
        analyzerInstruction: instruction
      }
    }],
    message: response,
    intentDetails: {
      question: request.question,
      knowledgeReferences: [],
      selectedModel: null,
      sql: '',
      insightGuidance: conversationFollowUps(
        suggestedFollowUps?.length ? suggestedFollowUps : analyzerInstructionFollowUps(),
        request.dataSourceId
      )
    }
  };
}

interface AnalyzerConversationContext {
  answer: string;
  followUps: string[];
  source?: DataSourceRecord;
}

function conversationAnswer(answer?: string | null, dataSourceId?: string): string {
  const context = analyzerConversationContext(dataSourceId);
  const provided = answer?.trim();
  if (provided && !shouldReplaceProvidedConversation(provided)) return provided;
  return context.answer;
}

function conversationFollowUps(suggestedFollowUps?: string[], dataSourceId?: string): string[] {
  const context = analyzerConversationContext(dataSourceId);
  if (!context.source) return context.followUps;
  const followUps = suggestedFollowUps?.map(item => item.trim()).filter(Boolean) ?? [];
  const hasStaleFollowUps = followUps.some(item => shouldReplaceProvidedConversation(item));
  if (hasStaleFollowUps) return context.followUps;
  const safeFollowUps = followUps.filter(item => !shouldReplaceProvidedConversation(item));
  if (safeFollowUps.length > 0) return safeFollowUps;
  return context.followUps;
}

function analyzerConversationContext(dataSourceId?: string): AnalyzerConversationContext {
  const source = dataSourceId ? findDataSource(dataSourceId) : undefined;
  if (!source) {
    return {
      answer: defaultAnalyzerConversationAnswer,
      followUps: defaultAnalyzerConversationFollowUps
    };
  }

  const models = source.tables.filter(isAiReadyDataModel);
  const description = sourceDescription(source);
  const modelNames = models.map(modelBusinessName).filter(Boolean).slice(0, 3);
  const modelClause = modelNames.length > 0
    ? ` I can use AI-ready data models such as ${joinList(modelNames)}.`
    : ' I can use the AI-ready data models and reviewed dictionary for this source.';
  const descriptionClause = description ? ` ${sentence(description)}` : '';
  return {
    source,
    answer: [
      `Hi. I can help with ${source.name}.`,
      descriptionClause,
      modelClause,
      ' Ask a business question, or ask me what this source can analyze.'
    ].join('').replace(/\s+/g, ' ').trim(),
    followUps: sourceConversationFollowUps(source, models)
  };
}

function sourceDescription(source: DataSourceRecord): string | null {
  return readString(source.description)
    ?? readString(source.dictionary.description)
    ?? readString(source.dictionary.businessPurpose)
    ?? readString(source.dictionary.aiPurpose)
    ?? readString(readRecord(source.dictionary.ai).description)
    ?? readString(readRecord(source.dictionary.ai).businessPurpose)
    ?? readString(readRecord(source.settings).description)
    ?? readString(readRecord(source.settings).businessPurpose);
}

function sourceConversationFollowUps(source: DataSourceRecord, models: TableDefinition[]): string[] {
  const questions = uniqueStrings([
    ...readStringArray(source.settings.analyzerPrompts),
    ...readStringArray(source.settings.suggestedAnalyzerQuestions),
    ...readStringArray(source.dictionary.sampleQuestions),
    ...readStringArray(readRecord(source.dictionary.ai).sampleQuestions),
    ...models.flatMap(table => tableConversationFollowUps(table)),
    ...fallbackSourceFollowUps(source, models)
  ]);
  return questions.slice(0, 3);
}

function tableConversationFollowUps(table: TableDefinition): string[] {
  const dictionary = table.dictionary;
  const ai = readRecord(dictionary.ai);
  const routing = readRecord(ai.routing);
  return [
    ...readStringArray(dictionary.sampleQuestions),
    ...readStringArray(ai.sampleQuestions),
    ...readStringArray(routing.sampleQuestions),
    ...readStringArray(routing.exampleQuestions),
    ...readStringArray(routing.phrases),
    ...readStringArray(routing.useFor).map(item => `Show me ${lowerFirst(item)}.`)
  ];
}

function fallbackSourceFollowUps(source: DataSourceRecord, models: TableDefinition[]): string[] {
  const modelNames = models.map(modelBusinessName).filter(Boolean);
  return [
    `What can I analyze in ${source.name}?`,
    ...(modelNames[0] ? [`Show me the main trends in ${modelNames[0]}.`] : []),
    ...(modelNames[1] ? [`Build a dashboard-ready summary from ${modelNames[1]}.`] : [])
  ];
}

function modelBusinessName(table: TableDefinition): string {
  return readString(table.dictionary.businessName) ?? toLabel(table.name);
}

function shouldReplaceProvidedConversation(value: string): boolean {
  void value;
  return false;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function sentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function lowerFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}
