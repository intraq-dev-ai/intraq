export type TableDateFormatPreset =
  | ''
  | '__custom__'
  | 'YYYY-MM-DD'
  | 'MM/DD/YYYY'
  | 'DD/MM/YYYY'
  | 'Month Name'
  | 'Day of Week'
  | 'Quarter'
  | 'YYYY';

export type TableBooleanPreset =
  | ''
  | 'custom'
  | 'true-false'
  | 'yes-no'
  | '1-0'
  | 'check-cross';

export const TABLE_DATE_FORMAT_PRESET_OPTIONS: ReadonlyArray<{ label: string; value: TableDateFormatPreset }> = [
  { label: 'Default', value: '' },
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
  { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
  { label: 'Month Name', value: 'Month Name' },
  { label: 'Day of Week', value: 'Day of Week' },
  { label: 'Quarter', value: 'Quarter' },
  { label: 'Year', value: 'YYYY' },
  { label: 'Custom', value: '__custom__' }
];

export const TABLE_BOOLEAN_PRESET_OPTIONS: ReadonlyArray<{ label: string; value: TableBooleanPreset }> = [
  { label: 'Default', value: '' },
  { label: 'True / False', value: 'true-false' },
  { label: 'Yes / No', value: 'yes-no' },
  { label: '1 / 0', value: '1-0' },
  { label: '✓ / ✗', value: 'check-cross' },
  { label: 'Custom', value: 'custom' }
];

const TABLE_DATE_FORMAT_PRESET_VALUES = new Set<TableDateFormatPreset>(
  TABLE_DATE_FORMAT_PRESET_OPTIONS.map(option => option.value).filter((value): value is Exclude<TableDateFormatPreset, '__custom__' | ''> => value !== '' && value !== '__custom__')
);

const TABLE_BOOLEAN_PRESET_LABELS: Record<Exclude<TableBooleanPreset, '' | 'custom'>, { falseLabel: string; trueLabel: string }> = {
  '1-0': { falseLabel: '0', trueLabel: '1' },
  'check-cross': { falseLabel: '✗', trueLabel: '✓' },
  'true-false': { falseLabel: 'False', trueLabel: 'True' },
  'yes-no': { falseLabel: 'No', trueLabel: 'Yes' }
};

export function inferTableDateFormatPreset(value: string | undefined): TableDateFormatPreset {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return TABLE_DATE_FORMAT_PRESET_VALUES.has(trimmed as TableDateFormatPreset) ? trimmed as TableDateFormatPreset : '__custom__';
}

export function inferTableBooleanPreset(trueLabel: string | undefined, falseLabel: string | undefined): TableBooleanPreset {
  const normalizedTrue = trueLabel?.trim() ?? '';
  const normalizedFalse = falseLabel?.trim() ?? '';
  if (!normalizedTrue && !normalizedFalse) return '';
  const preset = Object.entries(TABLE_BOOLEAN_PRESET_LABELS)
    .find(([, labels]) => labels.trueLabel === normalizedTrue && labels.falseLabel === normalizedFalse)?.[0];
  return preset ? preset as TableBooleanPreset : 'custom';
}

export function tableBooleanLabelsForPreset(preset: TableBooleanPreset): { falseLabel: string; trueLabel: string } {
  if (!preset || preset === 'custom') return { falseLabel: '', trueLabel: '' };
  return TABLE_BOOLEAN_PRESET_LABELS[preset];
}
