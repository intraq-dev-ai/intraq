type FilterConfig = Record<string, unknown> | null | undefined;

export function displayFilterValue(value: unknown, config?: FilterConfig): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return Object.values(value).map(String).join(' - ');
  if (isEmptyFilterValue(value, config)) return 'Any';
  return String(value);
}

export function clearFilterValue(config?: FilterConfig): unknown {
  const [first] = configuredEmptyValues(config);
  return first ?? 'all';
}

export function isEmptyFilterValue(value: unknown, config?: FilterConfig): boolean {
  if (value === undefined || value === null || value === '' || String(value).toLowerCase() === 'all') return true;
  return configuredEmptyValues(config).some(candidate => sameFilterValue(candidate, value));
}

function configuredEmptyValues(config?: FilterConfig): unknown[] {
  if (!config) return [];
  const plural = config.emptyValues
    ?? config.blankValues
    ?? config.noSelectionValues
    ?? config.placeholderValues
    ?? config.allValues;
  const values = valueList(plural);
  const single = config.emptyValue
    ?? config.blankValue
    ?? config.noSelectionValue
    ?? config.placeholderValue
    ?? config.allValue;
  if (single !== undefined) values.push(single);
  return values;
}

function valueList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.includes(',')) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return value === undefined ? [] : [value];
}

function sameFilterValue(left: unknown, right: unknown): boolean {
  if (typeof left === 'object' || typeof right === 'object') return stableStringify(left) === stableStringify(right);
  return String(left) === String(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}
