import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient, Prisma } from '@intraq/db';
import {
  decodePart,
  isRecord,
  readCompatRecord,
  sendCompatFailure,
  sendCompatJson
} from './compat-http.js';
import { findDataSource, type FieldDefinition, type TableDefinition } from './foundation-store.js';
import { canWriteDataSource, type DataSourceAccessPolicy } from './source-access.js';

export class BulkDictionaryCompatibilityRoutes {
  constructor(private readonly prismaClient: IntraQPrismaClient | null = null) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL, access?: DataSourceAccessPolicy): Promise<boolean> {
    const match = /^\/api\/data-sources\/([^/]+)\/bulk-dictionary$/.exec(url.pathname);
    if (req.method !== 'POST' || !match?.[1]) return false;

    await this.updateBulkDictionary(req, res, decodePart(match[1]), access);
    return true;
  }

  private async updateBulkDictionary(
    req: IncomingMessage,
    res: ServerResponse,
    dataSourceId: string,
    access?: DataSourceAccessPolicy
  ): Promise<void> {
    const source = findDataSource(dataSourceId);
    if (!source) {
      sendCompatFailure(res, 404, 'Data source not found');
      return;
    }
    if (access && !canWriteDataSource(source, access)) {
      sendCompatFailure(res, 403, 'Data source access is denied');
      return;
    }

    const body = await readCompatRecord(req);
    if (!body || !isRecord(body.tables)) {
      sendCompatFailure(res, 400, 'tables object is required');
      return;
    }

    let updated = 0;
    const skipped: string[] = [];
    for (const [tableKey, dictionary] of Object.entries(body.tables)) {
      const table = source.tables.find(item => item.id === tableKey || item.name === tableKey);
      if (!table || !isRecord(dictionary)) {
        skipped.push(tableKey);
        continue;
      }
      applyDictionary(table, dictionary);
      await this.persistTableDictionary(table);
      updated += 1;
    }

    sendCompatJson(res, 200, {
      success: true,
      message: `Updated ${updated} table dictionary${updated === 1 ? '' : ' entries'}.`,
      results: { updated, skipped },
      data: source
    });
  }

  private async persistTableDictionary(table: TableDefinition): Promise<void> {
    if (!this.prismaClient) return;
    await this.prismaClient.dataSourceTable.update({
      where: { id: table.id },
      data: {
        dictionary: inputJson(table.dictionary),
        fields: inputJson(table.fields)
      }
    });
  }
}

function applyDictionary(table: TableDefinition, dictionary: Record<string, unknown>): void {
  table.dictionary = { ...table.dictionary, ...dictionary };
  const fields = Array.isArray(dictionary.fields)
    ? dictionary.fields
    : Array.isArray(dictionary.columns)
      ? dictionary.columns
      : [];
  if (fields.length === 0) return;

  const byName = new Map<string, Record<string, unknown>>();
  for (const field of fields) {
    if (!isRecord(field)) continue;
    const name = String(field.name ?? '').trim();
    if (name) byName.set(name, field);
  }
  table.fields = table.fields.map(field => mergeField(field, byName.get(field.name)));
}

function mergeField(field: FieldDefinition, patch: Record<string, unknown> | undefined): FieldDefinition {
  if (!patch) return field;
  return {
    ...field,
    description: asText(patch.description) ?? field.description,
    dictionaryDescription: asText(patch.dictionaryDescription) ?? asText(patch.description) ?? field.dictionaryDescription
  };
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeJson(value) as Prisma.InputJsonValue;
}

function sanitizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJson(item)]));
}
