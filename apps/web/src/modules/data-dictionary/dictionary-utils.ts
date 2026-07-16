import type { DataDictionaryField, DataDictionarySource, DataDictionaryTable } from './types';
import { isPrimaryDemoSource, sortSourcesByPreference } from '../shared/source-preference';

export interface DashboardSuggestion {
  type: string;
  description: string;
}

const NUMERIC_TYPES = new Set(['INTEGER', 'INT', 'DECIMAL', 'FLOAT', 'NUMERIC', 'BIGINT', 'DOUBLE', 'REAL', 'NUMBER']);
const DATE_TYPES = new Set(['DATE', 'TIMESTAMP', 'DATETIME', 'TIME']);
const TEXT_TYPES = new Set(['VARCHAR', 'TEXT', 'STRING', 'CHAR']);

export function visibleDictionarySources(sources: DataDictionarySource[]): DataDictionarySource[] {
  return sortSourcesByPreference(sources
    .filter(source => !source.isSample || isPrimaryDemoSource(source))
    .map(source => ({ ...source, tables: source.tables.filter(table => table.isDataModel) }))
    .filter(source => source.tables.length > 0));
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let listItems: string[] = [];

  const flushList = (): void => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushList();
      const level = heading[1]?.length ?? 2;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2] ?? '')}</h${level}>`);
      continue;
    }
    const item = /^[-*]\s+(.+)$/.exec(trimmed);
    if (item) {
      listItems.push(item[1] ?? '');
      continue;
    }
    flushList();
    blocks.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  return blocks.join('');
}

export function stripMarkdown(markdown: string): string {
  return renderMarkdown(markdown).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tableDisplayName(table: DataDictionaryTable): string {
  const descriptionLabel = stripMarkdown(table.dictionaryDescription ?? '');
  return table.businessName ?? (descriptionLabel || table.name);
}

export function getDashboardSuggestions(table: DataDictionaryTable): DashboardSuggestion[] {
  const fields = table.fields;
  const metrics = fields.filter(field => NUMERIC_TYPES.has(field.type.toUpperCase()));
  const dateFields = fields.filter(field => DATE_TYPES.has(field.type.toUpperCase()));
  const textFields = fields.filter(field => TEXT_TYPES.has(field.type.toUpperCase()));
  const fieldNames = fields.map(field => field.name.toLowerCase());
  const suggestions: DashboardSuggestion[] = [];

  if (metrics.length > 0 && dateFields.length > 0) {
    suggestions.push({
      type: 'Time Trends',
      description: `See how ${fieldLabel(metrics[0])} changes over time`
    });
  }

  if (metrics.length > 0 && textFields.length > 0) {
    suggestions.push({
      type: 'Compare by Category',
      description: `Compare ${fieldLabel(metrics[0])} across different ${fieldLabel(textFields[0])}`
    });
  }

  if (fieldNames.some(name => name.includes('revenue') || name.includes('sales') || name.includes('amount'))) {
    suggestions.push({ type: 'Sales & Revenue', description: 'Track your sales performance and revenue over time' });
  }

  if (fieldNames.some(name => name.includes('customer') || name.includes('user') || name.includes('guest'))) {
    suggestions.push({ type: 'Customer Insights', description: 'Understand your customers and their behavior patterns' });
  }

  if (fieldNames.some(name => name.includes('product') || name.includes('item') || name.includes('menu'))) {
    suggestions.push({ type: 'Product Insights', description: 'See which products are performing best' });
  }

  return suggestions.slice(0, 3);
}

function fieldLabel(field: DataDictionaryField | undefined): string {
  if (!field) return 'metric';
  return field.description || field.dictionaryDescription || field.name;
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
