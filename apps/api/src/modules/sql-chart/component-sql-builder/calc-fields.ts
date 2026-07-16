import type { CalculatedField, ComponentConfig } from './types.js';
import type { Dialect } from './dialect.js';
import { replaceDynamicDatePlaceholders } from './date-utils.js';
import { filterRulesToCaseWhen } from './filter-rules.js';

function toSnake(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function calcFieldBackgroundName(cf: CalculatedField): string {
  return cf.backgroundName ?? toSnake(cf.name);
}

export function buildCalcFieldExpression(cf: CalculatedField, d: Dialect, dbType: string): string | null {
  if (!cf) return null;

  switch (cf.type) {
    case 'time_filter': {
      if (!cf.dateField || !cf.valueField) return null;
      return d.timeFilter(
        cf.dateField,
        cf.valueField,
        cf.yearOffset ?? 0,
        cf.yearType ?? 'calendar',
        cf.fiscalStartMonth ?? 1,
        cf.timezone
      );
    }

    case 'expression': {
      if (!cf.expression) return null;
      let sql = cf.expression.replace(/\[([^\]]+)\]/g, (_, field) => d.escapeField(field.trim()));
      return replaceDynamicDatePlaceholders(sql);
    }

    case 'conditional': {
      if (!cf.conditions?.length) return null;
      let stmt = 'CASE';
      for (const cond of cf.conditions) {
        if (!cond.field) continue;
        const field = d.escapeField(cond.field);
        const op = cond.operator === '==' ? '=' : (cond.operator || '=');
        let clause = '';
        if (op === 'between') {
          clause = `${field} BETWEEN ${cond.minValue ?? 0} AND ${cond.maxValue ?? 0}`;
        } else if (op === 'in' && Array.isArray(cond.value)) {
          const vals = cond.value.map((v: unknown) => `'${String(v).replace(/'/g, "''")}'`).join(', ');
          clause = `${field} IN (${vals})`;
        } else {
          clause = `${field} ${op} ${cond.value ?? 0}`;
        }
        stmt += ` WHEN ${clause} THEN '${String(cond.result ?? '').replace(/'/g, "''")}'`;
      }
      stmt += ` ELSE '${String(cf.defaultValue ?? '').replace(/'/g, "''")}' END`;
      return stmt;
    }

    case 'text': {
      if (!cf.template) return null;
      const parts: string[] = [];
      let last = 0;
      const regex = /\[([^\]]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(cf.template)) !== null) {
        if (m.index > last) parts.push(`'${cf.template.slice(last, m.index).replace(/'/g, "''")}'`);
        const fieldExpr = d.escapeField(m[1]!.trim());
        // SQL Server uses CAST to NVARCHAR, others use CAST to VARCHAR or ::text
        parts.push(dbType === 'sqlserver' || dbType === 'mssql'
          ? `CAST(${fieldExpr} AS NVARCHAR(MAX))`
          : `CAST(${fieldExpr} AS VARCHAR)`);
        last = m.index + m[0].length;
      }
      if (last < cf.template.length) parts.push(`'${cf.template.slice(last).replace(/'/g, "''")}'`);
      return parts.length > 0 ? `CONCAT(${parts.join(', ')})` : null;
    }

    case 'dateGrouping': {
      if (!cf.sourceField) return null;
      if (cf.grouping === 'custom' && cf.buckets?.length) {
        let stmt = 'CASE';
        for (const bucket of cf.buckets) {
          stmt += ` WHEN ${bucket.condition} THEN '${String(bucket.label).replace(/'/g, "''")}'`;
        }
        stmt += ` ELSE '${String(cf.defaultValue ?? 'Other').replace(/'/g, "''")}' END`;
        return stmt;
      }
      return d.dateGrouping(cf.sourceField, cf.grouping ?? '') ?? null;
    }

    case 'dateBucket': case 'date_bucket': {
      if (!cf.sourceField) return null;
      const config: ComponentConfig = {
        xField: cf.sourceField,
        ...(isXAxisGrouping(cf.grouping) ? { xAxisGrouping: cf.grouping } : {}),
        ...(cf.fiscalStartMonth === undefined ? {} : { fiscalStartMonth: cf.fiscalStartMonth }),
        ...(cf.weekNumbering === undefined ? {} : { weekNumbering: cf.weekNumbering }),
        ...(cf.weekStartDay === undefined ? {} : { weekStartDay: cf.weekStartDay }),
        ...(cf.yearType === undefined ? {} : { yearType: cf.yearType })
      };
      return d.xAxisGrouping(cf.sourceField, cf.grouping ?? '', config);
    }

    case 'dateTimeFormat': case 'date_time_format': {
      if (!cf.sourceField || !cf.format) return null;
      return d.dateTimeFormat(cf.sourceField, cf.format);
    }

    case 'filter': {
      if (!cf.filterRules || !cf.sourceField || cf.defaultValue === undefined) return null;
      try {
        return filterRulesToCaseWhen(cf.filterRules, cf.sourceField, cf.defaultValue, dbType, true);
      } catch {
        return null;
      }
    }

    default:
      return null;
  }
}

function isXAxisGrouping(value: unknown): value is NonNullable<ComponentConfig['xAxisGrouping']> {
  return value === 'day'
    || value === 'week'
    || value === 'month'
    || value === 'quarter'
    || value === 'year'
    || value === 'hour'
    || value === 'minute';
}

export function collectCalcFieldDependencies(cf: CalculatedField): string[] {
  const deps = new Set<string>();
  const add = (v?: string | null) => { if (typeof v === 'string' && v.trim()) deps.add(v.trim()); };
  add(cf.valueField); add(cf.dateField); add(cf.sourceField);
  if (Array.isArray(cf.fields)) cf.fields.forEach(add);
  if (Array.isArray(cf.conditions)) cf.conditions.forEach(c => add(c?.field));
  const scanTemplate = (t?: string) => {
    if (typeof t !== 'string') return;
    for (const m of t.matchAll(/\[([^\]]+)\]/g)) add(m[1]);
  };
  scanTemplate(cf.expression); scanTemplate(cf.template);
  return Array.from(deps);
}

export function buildCalcFieldMap(fields: CalculatedField[] | undefined): Map<string, CalculatedField> {
  const map = new Map<string, CalculatedField>();
  if (!Array.isArray(fields)) return map;
  for (const f of fields) {
    if (!f?.name) continue;
    map.set(f.name, f);
    const bg = calcFieldBackgroundName(f);
    if (bg !== f.name) map.set(bg, f);
  }
  return map;
}

export function isAggregateExpression(expression: string): boolean {
  return /\b(avg|count|min|max|sum)\s*\(/i.test(expression);
}
