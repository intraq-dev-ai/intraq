import {
  type DataSourceRecord,
  type TableDefinition,
  toLabel
} from '../data-source/foundation-store.js';
import { isAiReadyDataModel } from '../data-source/ai-ready-data-model.js';
import { isRecord, readString, readStringArray, uniqueStrings } from './analyzer-plan-utils.js';

export function descriptionForSource(source: DataSourceRecord): string | null {
  const ai = isRecord(source.dictionary.ai) ? source.dictionary.ai : {};
  return readString(source.description)
    ?? readString(source.dictionary.description)
    ?? readString(source.dictionary.businessPurpose)
    ?? readString(source.dictionary.aiPurpose)
    ?? readString(ai.description)
    ?? readString(ai.businessPurpose)
    ?? null;
}

export function sourceSampleQuestions(source: DataSourceRecord, models: TableDefinition[]): string[] {
  const ai = isRecord(source.dictionary.ai) ? source.dictionary.ai : {};
  return uniqueStrings([
    ...readStringArray(source.settings.analyzerPrompts),
    ...readStringArray(source.settings.suggestedAnalyzerQuestions),
    ...readStringArray(source.dictionary.sampleQuestions),
    ...readStringArray(ai.sampleQuestions),
    ...models.flatMap(table => sampleQuestionsForTable(table))
  ]);
}

export function isAnalyzerModel(table: TableDefinition): boolean {
  return isAiReadyDataModel(table);
}

export function businessNameForTable(table: TableDefinition): string {
  return readString(table.dictionary.businessName) ?? toLabel(table.name);
}

export function firstRoutingRecord(table: TableDefinition): Record<string, unknown> {
  const ai = isRecord(table.dictionary.ai) ? table.dictionary.ai : {};
  const routing = ai.routing ?? table.dictionary.routing;
  if (Array.isArray(routing)) return routing.find(isRecord) ?? {};
  return isRecord(routing) ? routing : {};
}

export function sampleQuestionsForTable(table: TableDefinition): string[] {
  const ai = isRecord(table.dictionary.ai) ? table.dictionary.ai : {};
  return uniqueStrings([
    ...readStringArray(table.dictionary.sampleQuestions),
    ...readStringArray(ai.sampleQuestions)
  ]);
}
