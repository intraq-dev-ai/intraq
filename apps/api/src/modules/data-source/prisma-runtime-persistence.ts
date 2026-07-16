import type { IntraQPrismaClient, Prisma } from '@intraq/db';
import { uuidv7 } from '@intraq/contracts';
import type { DataSourceRecord, TableDefinition } from './foundation-store.js';
import { encodeDataSourceConfig } from './data-source-config-secrets.js';

export async function createRuntimeDataSource(
  client: IntraQPrismaClient,
  source: DataSourceRecord
): Promise<void> {
  await client.dataSource.create({
    data: {
      id: source.id,
      name: source.name,
      description: sourceDescriptionValue(source),
      type: source.type,
      sourceType: source.sourceType,
      config: inputJson(encodeDataSourceConfig(source.config)),
      settings: inputJson(source.settings),
      dictionary: inputJson(source.dictionary),
      isActive: source.status !== 'inactive',
      createdBy: source.createdBy ?? null,
      isGlobal: source.isGlobal ?? false,
      isSample: source.isSample,
      isGloballyVisible: source.isGloballyVisible ?? false,
      tenantId: source.tenantId ?? null,
      tables: {
        create: source.tables.map(tableCreateInput)
      }
    }
  });
}

export async function updateRuntimeDataSource(
  client: IntraQPrismaClient,
  source: DataSourceRecord
): Promise<void> {
  await client.dataSource.update({
    where: { id: source.id },
    data: {
      name: source.name,
      description: sourceDescriptionValue(source),
      type: source.type,
      sourceType: source.sourceType,
      config: inputJson(encodeDataSourceConfig(source.config)),
      settings: inputJson(source.settings),
      dictionary: inputJson(source.dictionary),
      isActive: source.status !== 'inactive',
      createdBy: source.createdBy ?? null,
      isGlobal: source.isGlobal ?? false,
      isSample: source.isSample,
      isGloballyVisible: source.isGloballyVisible ?? false,
      tenantId: source.tenantId ?? null
    }
  });
}

export async function replaceRuntimeDataSourceTables(
  client: IntraQPrismaClient,
  source: DataSourceRecord
): Promise<void> {
  await client.$transaction(source.tables.map(table => client.dataSourceTable.upsert({
    where: {
      dataSourceId_name: {
        dataSourceId: source.id,
        name: table.name
      }
    },
    create: {
      ...tableCreateInput(table),
      dataSource: { connect: { id: source.id } }
    },
    update: {
      description: table.description,
      fields: inputJson(table.fields),
      dictionary: inputJson(table.dictionary),
      settings: inputJson(table.settings ?? {}),
      isSelected: table.isSelected,
      sqlQuery: table.sqlQuery ?? null
    }
  })));
}

export async function replaceRuntimeSampleRowsForTable(
  client: IntraQPrismaClient,
  table: TableDefinition
): Promise<void> {
  await client.sampleDataRow.deleteMany({ where: { tableId: table.id } });
  const rows = table.sampleRows ?? [];
  if (rows.length === 0) return;
  await client.sampleDataRow.createMany({
    data: sampleDataRowsCreateInput(rows).map(row => ({
      ...row,
      tableId: table.id
    }))
  });
}

export async function deleteRuntimeDataSource(
  client: IntraQPrismaClient,
  dataSourceId: string
): Promise<void> {
  await client.dataSource.deleteMany({ where: { id: dataSourceId } });
}

function tableCreateInput(table: TableDefinition): Prisma.DataSourceTableCreateWithoutDataSourceInput {
  return {
    id: table.id,
    name: table.name,
    description: table.description,
    fields: inputJson(table.fields),
    dictionary: inputJson(table.dictionary),
    settings: inputJson(table.settings ?? {}),
    isSelected: table.isSelected,
    sqlQuery: table.sqlQuery ?? null,
    sampleDataRows: {
      create: sampleDataRowsCreateInput(table.sampleRows ?? [])
    }
  };
}

function sampleDataRowsCreateInput(rows: Array<Record<string, unknown>>): Array<{ data: Prisma.InputJsonValue; id: string }> {
  const baseTimestamp = Date.now();
  return rows.map((row, index) => ({
    id: uuidv7(baseTimestamp + index),
    data: inputJson(row)
  }));
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

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sourceDescriptionValue(source: DataSourceRecord): string | null {
  return stringValue(source.description) ?? stringValue(source.dictionary.description);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
