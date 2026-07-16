import type { TableDefinition } from './foundation-store.js';

export function isAiReadyDataModel(table: TableDefinition | null | undefined): table is TableDefinition {
  if (!table || table.isSelected !== true || table.settings?.isDataModel !== true) return false;
  const targetType = readString(table.settings.targetType);
  if (targetType && targetType !== 'data_model') return false;
  const dictionaryTargetType = readString(table.dictionary.targetType);
  if (dictionaryTargetType === 'raw_table') return false;
  return table.fields.length > 0;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}
