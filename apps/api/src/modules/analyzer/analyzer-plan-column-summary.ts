import type { TableDefinition } from '../data-source/foundation-store.js';

export function defaultSummarizeForField(field: TableDefinition['fields'][number]): string {
  if (!isNumericFieldType(field.type)) return 'none';
  const fieldText = `${field.name} ${field.description} ${field.dictionaryDescription}`.toLowerCase();
  if (fieldText.includes('identifier') || fieldText.includes('join key') || /\b(id|key)\b/.test(fieldText)) return 'none';
  if (fieldText.includes('percent') || fieldText.includes('margin') || fieldText.includes('rate')) return 'avg';
  return 'sum';
}

export function defaultSummarizeForCalculatedField(field: string): string {
  const fieldText = field.toLowerCase();
  if (
    fieldText.includes('percent')
    || fieldText.includes('pct')
    || fieldText.includes('rate')
    || fieldText.includes('ticket')
    || fieldText.includes('check')
  ) {
    return 'avg';
  }
  return 'sum';
}

function isNumericFieldType(type: string): boolean {
  return /^(number|numeric|decimal|float|double|integer|int|bigint|smallint)$/i.test(type.trim());
}
