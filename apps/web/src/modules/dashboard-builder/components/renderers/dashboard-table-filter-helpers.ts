import type { TableFilterOperator, TableFilterOption } from '../../visualization/table-filter-runtime';

export const tableFilterOperators: Array<{ label: string; value: TableFilterOperator }> = [
  { label: 'Contains', value: 'contains' },
  { label: 'Equals', value: 'equals' },
  { label: 'Not Equals', value: 'not_equals' },
  { label: 'Greater Than', value: 'greater_than' },
  { label: 'Less Than', value: 'less_than' },
  { label: 'Greater or Equal', value: 'greater_equal' },
  { label: 'Less or Equal', value: 'less_equal' },
  { label: 'Starts With', value: 'starts_with' },
  { label: 'Ends With', value: 'ends_with' },
  { label: 'Is Empty', value: 'is_empty' },
  { label: 'Is Not Empty', value: 'is_not_empty' },
  { label: 'Between', value: 'between' },
  { label: 'In List', value: 'in_list' }
];

export function tableFilterOperatorShowsSingleValue(operator: TableFilterOperator): boolean {
  return !['between', 'is_empty', 'is_not_empty'].includes(operator);
}

export function tableFilterOperatorShowsRange(operator: TableFilterOperator): boolean {
  return operator === 'between';
}

export function tableFilterOperatorShowsCaseSensitive(operator: TableFilterOperator): boolean {
  return ['contains', 'ends_with', 'equals', 'in_list', 'not_equals', 'starts_with'].includes(operator);
}

export function tableFilterDraftIsValid(operator: TableFilterOperator, query: string, secondaryQuery: string): boolean {
  if (operator === 'is_empty' || operator === 'is_not_empty') return true;
  if (operator === 'between') return query.length > 0 && secondaryQuery.length > 0;
  return query.length > 0;
}

export function tableFilterOptionCountLabel(option: TableFilterOption): string {
  return `${option.count}`;
}
