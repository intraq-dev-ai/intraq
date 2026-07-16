import type { IntraQPrismaClient } from '@intraq/db';
import {
  buildDataSource,
  dataSources,
  type DataSourceRecord,
  type FieldDefinition,
  type TableDefinition
} from './foundation-store.js';
import {
  scopedDataSourcesForRead,
  type DataSourceAccessPolicy
} from './source-access.js';

export interface BuilderCatalogFieldResponse {
  name: string;
  type: string;
  aggregation?: string;
  aliases?: string[];
  columnType?: string;
  defaultAggregation?: string;
  description?: string;
  dictionaryDescription?: string;
  format?: string;
  label?: string;
  role?: string;
  sampleQuestions?: string[];
  sampleValues?: unknown[];
  semanticRole?: string;
  synonyms?: string[];
  valueAliases?: Record<string, string[]>;
  valueConcepts?: Array<Record<string, unknown>>;
}

export interface BuilderCatalogTableResponse {
  id: string;
  name: string;
  description: string;
  dictionary?: Record<string, unknown>;
  fields: BuilderCatalogFieldResponse[];
  isSelected: boolean;
  settings?: Record<string, unknown>;
}

export interface BuilderCatalogSourceResponse {
  id: string;
  name: string;
  status: string;
  settings?: Record<string, unknown>;
  tables: BuilderCatalogTableResponse[];
}

export async function loadBuilderCatalogSources(
  prismaClient: IntraQPrismaClient | null,
  access: DataSourceAccessPolicy
): Promise<BuilderCatalogSourceResponse[]> {
  const sources = prismaClient
    ? await loadBuilderCatalogSourcesFromPrisma(prismaClient)
    : dataSources;
  return scopedDataSourcesForRead(sources, access)
    .map(builderCatalogSourceForResponse)
    .filter(source => source.tables.length > 0);
}

async function loadBuilderCatalogSourcesFromPrisma(client: IntraQPrismaClient): Promise<DataSourceRecord[]> {
  const rows = await client.dataSource.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      sourceType: true,
      isActive: true,
      isGlobal: true,
      isSample: true,
      isGloballyVisible: true,
      tenantId: true,
      createdBy: true,
      settings: true,
      tables: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          fields: true,
          dictionary: true,
          settings: true,
          isSelected: true
        }
      }
    }
  });
  return rows.map(row => buildDataSource({
    id: row.id,
    name: row.name,
    type: row.type,
    sourceType: row.sourceType,
    status: row.isActive ? 'connected' : 'inactive',
    createdBy: row.createdBy,
    isGlobal: row.isGlobal,
    isSample: row.isSample,
    isGloballyVisible: row.isGloballyVisible,
    tenantId: row.tenantId,
    settings: readRecord(row.settings),
    tables: row.tables.map(table => ({
      id: table.id,
      name: table.name,
      description: table.description ?? `${table.name} table`,
      fields: table.fields,
      dictionary: readRecord(table.dictionary),
      settings: readRecord(table.settings),
      isSelected: table.isSelected
    }))
  }));
}

function builderCatalogSourceForResponse(source: DataSourceRecord): BuilderCatalogSourceResponse {
  const tables = source.tables
    .filter(table => isBuilderCatalogTable(source, table))
    .map(builderCatalogTableForResponse);
  return {
    id: source.id,
    name: source.name,
    status: source.status,
    ...(hasKeys(source.settings) ? { settings: source.settings } : {}),
    tables
  };
}

function builderCatalogTableForResponse(table: TableDefinition): BuilderCatalogTableResponse {
  return {
    id: table.id,
    name: table.name,
    description: table.description,
    fields: table.fields.map(builderCatalogFieldForResponse),
    isSelected: table.isSelected,
    ...(hasKeys(table.settings) ? { settings: table.settings } : {}),
    ...(hasKeys(table.dictionary) ? { dictionary: table.dictionary } : {})
  };
}

function builderCatalogFieldForResponse(field: FieldDefinition): BuilderCatalogFieldResponse {
  return {
    name: field.name,
    type: field.type,
    ...(field.aggregation ? { aggregation: field.aggregation } : {}),
    ...(field.aliases?.length ? { aliases: [...field.aliases] } : {}),
    ...(field.columnType ? { columnType: field.columnType } : {}),
    ...(field.defaultAggregation ? { defaultAggregation: field.defaultAggregation } : {}),
    ...(field.description ? { description: field.description } : {}),
    ...(field.dictionaryDescription ? { dictionaryDescription: field.dictionaryDescription } : {}),
    ...(field.format ? { format: field.format } : {}),
    ...(field.label ? { label: field.label } : {}),
    ...(field.role ? { role: field.role } : {}),
    ...(field.sampleQuestions?.length ? { sampleQuestions: [...field.sampleQuestions] } : {}),
    ...(field.sampleValues?.length ? { sampleValues: field.sampleValues } : {}),
    ...(field.semanticRole ? { semanticRole: field.semanticRole } : {}),
    ...(field.synonyms?.length ? { synonyms: [...field.synonyms] } : {}),
    ...(field.valueAliases && Object.keys(field.valueAliases).length ? { valueAliases: field.valueAliases } : {}),
    ...(field.valueConcepts?.length ? { valueConcepts: field.valueConcepts } : {})
  };
}

function isBuilderCatalogTable(source: DataSourceRecord, table: TableDefinition): boolean {
  if (source.type === 'api') return table.isSelected !== false;
  const settingsTargetType = readString(table.settings?.targetType)?.toLowerCase();
  const dictionaryTargetType = readString(table.dictionary.targetType)?.toLowerCase();
  if (settingsTargetType && settingsTargetType !== 'data_model') return false;
  if (dictionaryTargetType === 'raw_table') return false;
  return table.isSelected !== false && table.settings?.isDataModel === true;
}

function hasKeys(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return Boolean(value && Object.keys(value).length > 0);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
