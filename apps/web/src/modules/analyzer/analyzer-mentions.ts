import type { AnalyzerColumn, AnalyzerExecution } from './types';

export interface AnalyzerMentionQuery {
  end: number;
  query: string;
  start: number;
}

export interface AnalyzerMentionOption {
  field: string;
  fieldLabel: string;
  insertText: string;
  searchText: string;
  value: string;
}

export interface AnalyzerMentionGroup {
  field: string;
  label: string;
  options: AnalyzerMentionOption[];
}

const MAX_MENTION_OPTIONS = 20;

export function readAnalyzerMentionQuery(text: string, cursor: number): AnalyzerMentionQuery | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const prefix = text.slice(0, safeCursor);
  const start = prefix.lastIndexOf('@');
  if (start < 0) return null;
  const raw = prefix.slice(start + 1);
  if (!raw || /\s/.test(raw)) return null;
  return { start, end: safeCursor, query: raw.toLowerCase() };
}

export function applyAnalyzerMention(
  text: string,
  mention: AnalyzerMentionQuery,
  option: AnalyzerMentionOption
): { cursor: number; text: string } {
  const next = `${text.slice(0, mention.start)}${option.insertText}${text.slice(mention.end)}`;
  return { text: next, cursor: mention.start + option.insertText.length };
}

export function buildAnalyzerMentionGroups(execution: AnalyzerExecution | null): AnalyzerMentionGroup[] {
  if (!execution?.rows?.length || !execution.columns?.length) return [];

  const groups: AnalyzerMentionGroup[] = [];
  let count = 0;
  for (const column of execution.columns) {
    if (count >= MAX_MENTION_OPTIONS) break;
    if (isNumericColumn(execution.rows, column)) continue;
    const values = uniqueFieldValues(execution.rows, column.field);
    if (!values.length) continue;
    const options: AnalyzerMentionOption[] = [];
    for (const value of values) {
      if (count >= MAX_MENTION_OPTIONS) break;
      options.push({
        field: column.field,
        fieldLabel: column.label,
        value,
        insertText: `@ ${column.label} = ${value} `,
        searchText: `${column.label} ${value}`.toLowerCase()
      });
      count += 1;
    }
    if (options.length) groups.push({ field: column.field, label: column.label, options });
  }
  return groups;
}

export function filterAnalyzerMentionGroups(
  groups: AnalyzerMentionGroup[],
  query: string
): AnalyzerMentionGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return groups;
  return groups
    .map(group => ({
      ...group,
      options: group.options.filter(option => option.searchText.includes(normalized))
    }))
    .filter(group => group.options.length > 0);
}

function isNumericColumn(rows: Array<Record<string, unknown>>, column: AnalyzerColumn): boolean {
  return rows.some(row => {
    const value = row[column.field];
    return (typeof value === 'number' && Number.isFinite(value))
      || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
  });
}

function uniqueFieldValues(rows: Array<Record<string, unknown>>, field: string): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = stringifyValue(row[field]);
    if (value) values.add(value);
  }
  return Array.from(values);
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return '';
}
