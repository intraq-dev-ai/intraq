import type { BuilderDataTable } from '../types';

export function isDashboardAiReadyDataModel(
  table: BuilderDataTable | null | undefined
): table is BuilderDataTable {
  if (!table || table.isSelected === false || table.settings?.isDataModel !== true) return false;
  const targetType = readString(table.settings.targetType);
  if (targetType && targetType !== 'data_model') return false;
  const dictionaryTargetType = readString(table.dictionary?.targetType);
  if (dictionaryTargetType === 'raw_table') return false;
  return table.fields.length > 0;
}

export function aiReadyDataModels(source: { tables: BuilderDataTable[] } | null | undefined): BuilderDataTable[] {
  return source?.tables.filter(isDashboardAiReadyDataModel) ?? [];
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}
