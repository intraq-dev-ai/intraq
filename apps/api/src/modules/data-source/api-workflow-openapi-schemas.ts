import type { FieldDefinition, TableDefinition } from './foundation-store.js';

export function apiWorkflowRequestSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, default: 100 },
      maxLimit: { type: 'integer', minimum: 1 },
      offset: { type: 'integer', minimum: 0, default: 0 },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, default: 100 },
      parameterValues: {
        type: 'object',
        additionalProperties: true,
        description: 'Runtime values for API endpoint templates.'
      },
      parameters: {
        type: 'object',
        additionalProperties: true,
        description: 'Alternative parameter object accepted by the workflow runtime.'
      },
      selectFields: {
        type: 'array',
        items: { type: 'string' }
      },
      skip: {
        type: 'integer',
        minimum: 0,
        description: 'Kendo-compatible alias for offset.'
      },
      take: {
        type: 'integer',
        minimum: 1,
        description: 'Kendo-compatible alias for limit/pageSize.'
      }
    }
  };
}

export function apiWorkflowResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      data: {
        type: 'object',
        properties: {
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'object', additionalProperties: true } },
          totalRows: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          offset: { type: 'integer' },
          hasMore: { type: 'boolean' },
          totalAvailableRows: { type: 'integer' }
        },
        required: ['columns', 'rows', 'totalRows']
      }
    },
    required: ['success', 'data']
  };
}

export function clientCredentialsTokenResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['access_token', 'token_type', 'expires_in'],
    properties: {
      success: { type: 'boolean', const: true },
      access_token: { type: 'string' },
      token_type: { type: 'string', const: 'Bearer' },
      expires_in: { type: 'integer', minimum: 1 },
      scope: { type: 'string' },
      data: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          tokenType: { type: 'string', const: 'Bearer' },
          expiresIn: { type: 'integer', minimum: 1 },
          scope: { type: 'string' }
        }
      }
    }
  };
}

export function tableRowSchema(fields: FieldDefinition[]): Record<string, unknown> {
  if (fields.length === 0) return { type: 'object', additionalProperties: true };
  return {
    type: 'object',
    additionalProperties: true,
    properties: Object.fromEntries(fields.map(field => [field.name, fieldSchema(field)]))
  };
}

export function tableResponseSchema(table: TableDefinition, rowSchema: Record<string, unknown>): Record<string, unknown> {
  if (isLegacyResponseContract(readApiWorkflowResponseContract(table))) return legacyResponseContractSchema(table, rowSchema);
  return {
    allOf: [
      { $ref: '#/components/schemas/ApiWorkflowResponse' },
      {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              rows: {
                type: 'array',
                items: rowSchema
              }
            }
          }
        }
      }
    ]
  };
}

export function readApiWorkflowResponseContract(table: TableDefinition): string | null {
  const settings = readRecord(table.settings);
  const api = readRecord(settings.api);
  const contract = readRecord(settings.contract);
  return readString(
    settings.responseContract
      ?? settings.responseContractType
      ?? settings.legacyResponseContract
      ?? contract.type
      ?? api.responseContract
      ?? api.contract
  )?.toLowerCase() ?? null;
}

export function errorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorEnvelope' }
      }
    }
  };
}

function legacyResponseContractSchema(table: TableDefinition, rowSchema: Record<string, unknown>): Record<string, unknown> {
  const assertions = readLegacyResponseAssertions(table);
  const successPath = readString(assertions.successPath) ?? 'Successed';
  const requiredPaths = stringArray(assertions.requiredPaths);
  const arrayPaths = stringArray(assertions.arrayPaths);
  const objectPaths = stringArray(assertions.objectPaths);
  const numericPaths = stringArray(assertions.numericPaths);
  const schema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: true,
    properties: {}
  };
  const contractPaths = [...requiredPaths, ...arrayPaths, ...objectPaths, ...numericPaths];
  const dataNeedsObject = contractPaths.some(item => /^Data\./i.test(item));

  setSchemaPath(schema, successPath, { type: 'boolean', const: true });

  if (contractPaths.length === 0) {
    setSchemaPath(schema, 'Data', { type: 'array', items: rowSchema });
    return schema;
  }

  if (dataNeedsObject) {
    setSchemaPath(schema, 'Data', { type: 'object', additionalProperties: true, properties: {} });
  } else if (contractPaths.some(item => item.toLowerCase() === 'data')) {
    setSchemaPath(schema, 'Data', { type: 'array', items: rowSchema });
  }

  for (const path of arrayPaths) {
    setSchemaPath(schema, path, { type: 'array', items: rowSchema });
  }
  for (const path of objectPaths) {
    setSchemaPath(schema, path, { type: 'object', additionalProperties: true, properties: {} });
  }
  for (const path of numericPaths) {
    setSchemaPath(schema, path, { type: 'number' });
  }
  for (const path of requiredPaths) {
    if (!hasSchemaPath(schema, path)) setSchemaPath(schema, path, defaultLegacyResponseSchema(path, rowSchema));
  }

  return schema;
}

function isLegacyResponseContract(contractName: string | null): boolean {
  return contractName === 'legacy-response' || contractName === 'legacy-report';
}

function readLegacyResponseAssertions(table: TableDefinition): Record<string, unknown> {
  const settings = readRecord(table.settings);
  const legacyResponseContract = readRecord(settings.legacyResponseContract ?? settings.contract);
  return readRecord(legacyResponseContract.assertions ?? legacyResponseContract);
}

function defaultLegacyResponseSchema(path: string, rowSchema: Record<string, unknown>): Record<string, unknown> {
  const lower = path.toLowerCase();
  if (lower.endsWith('.data') || lower === 'data' || lower.includes('summaries') || lower.includes('list')) {
    return { type: 'array', items: rowSchema };
  }
  if (lower.includes('total') || lower.includes('count')) return { type: 'number' };
  if (lower.includes('range') || lower.includes('label') || lower.includes('name')) return { type: 'array', items: {} };
  return { type: 'object', additionalProperties: true, properties: {} };
}

function setSchemaPath(root: Record<string, unknown>, path: string, schema: Record<string, unknown>): void {
  const parts = path.split('.').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return;
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    addRequired(current, part);
    const properties = ensureProperties(current);
    const existing = readRecord(properties[part]);
    if (existing.type !== 'object') {
      properties[part] = { type: 'object', additionalProperties: true, properties: {} };
    } else {
      properties[part] = {
        additionalProperties: true,
        ...existing,
        properties: readRecord(existing.properties)
      };
    }
    current = properties[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1]!;
  addRequired(current, leaf);
  const properties = ensureProperties(current);
  const existing = readRecord(properties[leaf]);
  properties[leaf] = mergeSchemas(existing, schema);
}

function hasSchemaPath(root: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.').map(part => part.trim()).filter(Boolean);
  let current = root;
  for (const part of parts) {
    const properties = readRecord(current.properties);
    const next = properties[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) return false;
    current = next as Record<string, unknown>;
  }
  return true;
}

function ensureProperties(schema: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(schema.properties)) schema.properties = {};
  return schema.properties as Record<string, unknown>;
}

function addRequired(schema: Record<string, unknown>, key: string): void {
  const existing = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string')
    : [];
  if (!existing.includes(key)) schema.required = [...existing, key];
}

function mergeSchemas(existing: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(existing).length === 0) return next;
  if (existing.type === 'object' && next.type === 'object') {
    return {
      additionalProperties: true,
      ...existing,
      ...next,
      properties: {
        ...readRecord(existing.properties),
        ...readRecord(next.properties)
      }
    };
  }
  return next;
}

function fieldSchema(field: FieldDefinition): Record<string, unknown> {
  const normalized = field.type.toLowerCase();
  const type = normalized.includes('int')
    ? 'integer'
    : normalized.includes('number') || normalized.includes('decimal') || normalized.includes('float') || normalized.includes('double')
      ? 'number'
      : normalized.includes('bool')
        ? 'boolean'
        : 'string';
  return {
    type,
    ...(field.description ? { description: field.description } : {}),
    ...(field.format ? { format: field.format } : {})
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
