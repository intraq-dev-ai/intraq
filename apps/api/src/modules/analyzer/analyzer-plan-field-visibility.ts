import type { FieldDefinition, TableDefinition } from '../data-source/foundation-store.js';
import { analyzerFieldMetadata } from './analyzer-plan-field-matching.js';

export function analyzerFieldIsVisible(table: TableDefinition, field: FieldDefinition): boolean {
  if (field.analyzerHidden === true || field.hiddenFromAnalyzer === true) return false;
  const metadata = analyzerFieldMetadata(table, field.name);
  return metadata.analyzerHidden !== true
    && metadata.hiddenFromAnalyzer !== true
    && metadata.includeInAnalyzer !== false;
}

export function analyzerVisibleFields(table: TableDefinition): FieldDefinition[] {
  return table.fields.filter(field => analyzerFieldIsVisible(table, field));
}

export function analyzerVisibleFieldNames(table: TableDefinition): Set<string> {
  return new Set(analyzerVisibleFields(table).map(field => field.name));
}
