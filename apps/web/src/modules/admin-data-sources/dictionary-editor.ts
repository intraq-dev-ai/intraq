import type { AdminDataSourceField, AdminDataSourceTable, AdminTableDictionaryDetails } from './types';

export interface AdminDictionaryColumnDraft extends AdminDataSourceField {
  businessName: string;
  columnType: string;
  formatHint: string;
  isDimension: boolean;
  isKey: boolean;
  isMetric: boolean;
}

export interface AdminTableDictionaryDraft {
  businessName: string;
  businessPurpose: string;
  businessRules: string;
  columns: AdminDictionaryColumnDraft[];
  commonFilters: string;
  dataLineage: string;
  derivedColumns: AdminDerivedColumnDraft[];
  keyMetrics: string;
  performanceNotes: string;
  qualityIssues: string;
  recordCountEstimate: string;
  relatedTables: string;
  sampleQuestions: string;
  tableDescription: string;
  updateFrequency: string;
  valueConcepts: AdminValueConceptDraft[];
}

export interface AdminDerivedColumnDraft {
  columnType: string;
  description: string;
  formula: string;
  name: string;
  outputFormat: string;
  type: string;
}

export interface AdminValueConceptDraft {
  appliesToMetrics: string;
  conceptKey: string;
  label: string;
  matchType: 'equals' | 'in';
  matchValues: string;
  synonyms: string;
  targetField: string;
}

export function buildDictionaryDraft(
  dictionary: AdminTableDictionaryDetails | null,
  table: AdminDataSourceTable | null
): AdminTableDictionaryDraft {
  const sourceFields = dictionary?.fields.length ? dictionary.fields : table?.fields ?? [];
  return {
    businessName: dictionary?.businessName ?? table?.businessName ?? table?.name ?? '',
    businessPurpose: dictionary?.businessPurpose ?? '',
    businessRules: dictionary?.businessRules ?? '',
    columns: sourceFields.map(toColumnDraft),
    commonFilters: dictionary?.commonFilters ?? '',
    dataLineage: dictionary?.dataLineage ?? '',
    derivedColumns: dictionary?.derivedColumns?.map(column => ({ ...column })) ?? [],
    keyMetrics: dictionary?.keyMetrics ?? '',
    performanceNotes: dictionary?.performanceNotes ?? '',
    qualityIssues: dictionary?.qualityIssues ?? '',
    recordCountEstimate: dictionary?.recordCountEstimate ? String(dictionary.recordCountEstimate) : '',
    relatedTables: dictionary?.relatedTables ?? '',
    sampleQuestions: dictionary?.sampleQuestions.join('\n') ?? '',
    tableDescription: dictionary?.description ?? table?.dictionaryDescription ?? table?.description ?? '',
    updateFrequency: dictionary?.updateFrequency ?? '',
    valueConcepts: dictionary?.valueConcepts?.map(concept => ({
      appliesToMetrics: concept.appliesToMetrics.join('\n'),
      conceptKey: concept.conceptKey,
      label: concept.label,
      matchType: concept.matchType,
      matchValues: concept.matchValues.join('\n'),
      synonyms: concept.synonyms.join('\n'),
      targetField: concept.targetField
    })) ?? []
  };
}

export function toDictionarySavePayload(draft: AdminTableDictionaryDraft): Record<string, unknown> {
  return {
    businessName: draft.businessName.trim(),
    businessPurpose: draft.businessPurpose.trim(),
    businessRules: draft.businessRules.trim(),
    commonFilters: draft.commonFilters.trim(),
    dataLineage: draft.dataLineage.trim(),
    description: draft.tableDescription.trim(),
    derivedColumns: draft.derivedColumns
      .filter(column => column.name.trim() || column.formula.trim())
      .map(column => ({
        columnType: column.columnType,
        description: column.description.trim(),
        formula: column.formula.trim(),
        name: column.name.trim(),
        outputFormat: column.outputFormat,
        type: column.type
      })),
    fields: draft.columns.map(column => ({
      name: column.name,
      type: column.type,
      description: column.businessName.trim() || column.description,
      dictionaryDescription: column.dictionaryDescription.trim(),
      businessName: column.businessName.trim(),
      columnType: column.columnType,
      formatHint: column.formatHint,
      isDimension: column.isDimension,
      isKey: column.isKey,
      isMetric: column.isMetric
    })),
    keyMetrics: draft.keyMetrics.trim(),
    performanceNotes: draft.performanceNotes.trim(),
    qualityIssues: draft.qualityIssues.trim(),
    recordCountEstimate: readRecordCount(draft.recordCountEstimate),
    relatedTables: draft.relatedTables.trim(),
    sampleQuestions: readLines(draft.sampleQuestions),
    tableDescription: draft.tableDescription.trim(),
    updateFrequency: draft.updateFrequency,
    valueConcepts: draft.valueConcepts
      .filter(concept => concept.conceptKey.trim())
      .map(concept => ({
        appliesToMetrics: readLines(concept.appliesToMetrics),
        conceptKey: concept.conceptKey.trim(),
        label: concept.label.trim(),
        matchType: concept.matchType,
        matchValues: readLines(concept.matchValues),
        synonyms: readLines(concept.synonyms),
        targetField: concept.targetField.trim()
      }))
  };
}

function toColumnDraft(field: AdminDataSourceField): AdminDictionaryColumnDraft {
  return {
    ...field,
    businessName: field.businessName ?? field.description ?? '',
    columnType: field.columnType ?? '',
    formatHint: field.formatHint ?? '',
    isDimension: field.isDimension === true,
    isKey: field.isKey === true,
    isMetric: field.isMetric === true
  };
}

function readLines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

function readRecordCount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
