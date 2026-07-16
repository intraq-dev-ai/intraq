import type { IntraQPrismaClient } from '@intraq/db';
import {
  buildDataSource,
  dataSources,
  type DataSourceRecord,
  type FieldDefinition,
  type TableDefinition
} from './foundation-store.js';
import { decodeDataSourceConfig } from './data-source-config-secrets.js';

export interface EnsureDataSourcesLoadedOptions {
  dataSourceId?: string;
}

export type EnsureDataSourcesLoaded = (options?: EnsureDataSourcesLoadedOptions) => Promise<void>;

const syncedDataSourceIds = new Set<string>();
const DEFAULT_RUNTIME_SAMPLE_ROWS_MAX = 20;
const MAX_RUNTIME_SAMPLE_ROWS_MAX = 100;

export class PrismaDataSourceRuntimeSync {
  private fullyLoaded = false;
  private loading: Promise<void> | null = null;
  private readonly loadingSources = new Map<string, Promise<void>>();

  constructor(private readonly client: IntraQPrismaClient) {}

  async ensureLoaded(options: EnsureDataSourcesLoadedOptions = {}): Promise<void> {
    const dataSourceId = options.dataSourceId?.trim();
    if (dataSourceId) {
      await this.ensureSourceLoaded(dataSourceId);
      return;
    }
    if (this.fullyLoaded) return;
    if (this.loading) {
      await this.loading;
      return;
    }

    this.loading = this.loadDataSources().finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  private async ensureSourceLoaded(dataSourceId: string): Promise<void> {
    if (runtimeSourceLoaded(dataSourceId) && (this.fullyLoaded || syncedDataSourceIds.has(dataSourceId))) return;
    if (this.loading) {
      await this.loading;
      if (runtimeSourceLoaded(dataSourceId) && syncedDataSourceIds.has(dataSourceId)) return;
    }
    const existing = this.loadingSources.get(dataSourceId);
    if (existing) {
      await existing;
      return;
    }

    const loading = this.loadDataSources({ dataSourceId }).finally(() => {
      this.loadingSources.delete(dataSourceId);
    });
    this.loadingSources.set(dataSourceId, loading);
    await loading;
  }

  private async loadDataSources(options: EnsureDataSourcesLoadedOptions = {}): Promise<void> {
    const sampleRowsTake = runtimeSampleRowsMax();
    const rows = await this.client.dataSource.findMany({
      where: {
        isActive: true,
        ...(options.dataSourceId ? { id: options.dataSourceId } : {})
      },
      orderBy: { createdAt: 'asc' },
      include: {
        tables: {
          orderBy: { createdAt: 'asc' },
          include: {
            sampleDataRows: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: sampleRowsTake
            }
          }
        }
      }
    });
    const records = rows.map(row => buildDataSource({
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      sourceType: row.sourceType,
      status: row.isActive ? 'connected' : 'inactive',
      createdBy: row.createdBy,
      isGlobal: row.isGlobal,
      isSample: row.isSample,
      isGloballyVisible: row.isGloballyVisible,
      tenantId: row.tenantId,
      config: decodeDataSourceConfig(row.config),
      settings: recordFromJson(row.settings),
      dictionary: recordFromJson(row.dictionary),
      tables: row.tables.map(table => tableRecordFromRow(table))
    }));
    replaceSyncedRuntimeSources(records, options.dataSourceId ? { scopeIds: [options.dataSourceId] } : {});
    if (!options.dataSourceId) this.fullyLoaded = true;
    if (options.dataSourceId) {
      for (const dependencyId of runtimeDependencySourceIds(records)) {
        await this.ensureSourceLoaded(dependencyId);
      }
    }
  }
}

function runtimeSourceLoaded(dataSourceId: string): boolean {
  return dataSources.some(source => source.id === dataSourceId);
}

export function noopEnsureDataSourcesLoaded(): Promise<void> {
  return Promise.resolve();
}

export function resetPrismaDataSourceRuntimeSyncForTest(): void {
  syncedDataSourceIds.clear();
}

function replaceSyncedRuntimeSources(records: DataSourceRecord[], options: { scopeIds?: string[] } = {}): void {
  const nextIds = new Set(records.map(source => source.id));
  const scopeIds = options.scopeIds ? new Set(options.scopeIds) : null;
  for (let index = dataSources.length - 1; index >= 0; index -= 1) {
    const source = dataSources[index];
    if (source && syncedDataSourceIds.has(source.id) && (!scopeIds || scopeIds.has(source.id)) && !nextIds.has(source.id)) {
      dataSources.splice(index, 1);
      syncedDataSourceIds.delete(source.id);
    }
  }

  for (const source of records) {
    const index = dataSources.findIndex(item => item.id === source.id);
    if (index >= 0) {
      dataSources[index] = source;
    } else {
      dataSources.push(source);
    }
    syncedDataSourceIds.add(source.id);
  }
}

function tableRecordFromRow(row: {
  id: string;
  name: string;
  description: string | null;
  fields: unknown;
  dictionary: unknown;
  settings: unknown;
  isSelected: boolean;
  sqlQuery: string | null;
  sampleDataRows: Array<{ data: unknown }>;
}): TableDefinition {
  const record = buildDataSource({
    name: 'table normalizer',
    tables: [{
      id: row.id,
      name: row.name,
      description: row.description ?? `${row.name} table`,
      fields: fieldDefinitionsFromJson(row.fields),
      dictionary: recordFromJson(row.dictionary),
      settings: recordFromJson(row.settings),
      isSelected: row.isSelected,
      sampleRows: row.sampleDataRows.map(item => recordFromJson(item.data)),
      sqlQuery: row.sqlQuery
    }]
  });
  return record.tables[0] as TableDefinition;
}

function fieldDefinitionsFromJson(value: unknown): FieldDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim()) return [];
    const description = asString(item.description) ?? asString(item.dictionaryDescription) ?? '';
    const aggregation = asString(item.aggregation);
    const aliases = stringArrayFromJson(item.aliases);
    const synonyms = stringArrayFromJson(item.synonyms);
    const columnType = asString(item.columnType);
    const defaultAggregation = asString(item.defaultAggregation);
    const format = asString(item.format);
    const label = asString(item.label);
    const role = asString(item.role);
    const sampleQuestions = stringArrayFromJson(item.sampleQuestions);
    const semanticRole = asString(item.semanticRole);
    const valueAliases = valueAliasesFromJson(item.valueAliases);
    const valueConcepts = recordArrayFromJson(item.valueConcepts);
    return [{
      name: item.name.trim(),
      type: asString(item.type) ?? 'string',
      description,
      dictionaryDescription: asString(item.dictionaryDescription) ?? description,
      ...(aggregation ? { aggregation } : {}),
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(item.analyzerHidden === true ? { analyzerHidden: true } : {}),
      ...(columnType ? { columnType } : {}),
      ...(defaultAggregation ? { defaultAggregation } : {}),
      ...(format ? { format } : {}),
      ...(item.hiddenFromAnalyzer === true ? { hiddenFromAnalyzer: true } : {}),
      ...(label ? { label } : {}),
      ...(role ? { role } : {}),
      ...(sampleQuestions.length > 0 ? { sampleQuestions } : {}),
      ...(Array.isArray(item.sampleValues) ? { sampleValues: item.sampleValues } : {}),
      ...(semanticRole ? { semanticRole } : {}),
      ...(synonyms.length > 0 ? { synonyms } : {}),
      ...(Object.keys(valueAliases).length > 0 ? { valueAliases } : {}),
      ...(valueConcepts.length > 0 ? { valueConcepts } : {})
    }];
  });
}

function recordFromJson(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function runtimeDependencySourceIds(sources: DataSourceRecord[]): string[] {
  const ids = new Set<string>();
  for (const source of sources) {
    for (const raw of [
      source.config.credentialLookup,
      source.config.templateVariableLookup,
      source.config.authVariableLookup,
      source.config.composite,
      source.config.workflow,
      source.config.dataWorkflow
    ]) {
      for (const id of dependencySourceIds(raw)) {
        if (id && id !== source.id) ids.add(id);
      }
    }
    for (const table of source.tables) {
      const tableSettings = recordFromJson(table.settings);
      const apiSettings = recordFromJson(table.settings?.api ?? table.settings?.request);
      for (const raw of [
        apiSettings.credentialLookup,
        apiSettings.templateVariableLookup,
        apiSettings.authVariableLookup,
        apiSettings.composite,
        apiSettings.workflow,
        apiSettings.dataWorkflow,
        tableSettings.composite,
        tableSettings.workflow,
        tableSettings.dataWorkflow
      ]) {
        for (const id of dependencySourceIds(raw)) {
          if (id && id !== source.id) ids.add(id);
        }
      }
    }
  }
  return [...ids];
}

function dependencySourceIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(dependencySourceIds);
  if (!isRecord(value)) return [];
  const record = recordFromJson(value);
  const direct = lookupSourceId(record);
  const nested = [
    record.segments,
    record.sources,
    record.inputs,
    record.children
  ].flatMap(dependencySourceIds);
  return [
    ...(direct ? [direct] : []),
    ...nested
  ];
}

function lookupSourceId(value: unknown): string | undefined {
  const record = recordFromJson(value);
  const candidate = record.dataSourceId ?? record.sourceId ?? record.lookupDataSourceId;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function runtimeSampleRowsMax(): number {
  const raw = process.env.INTRAQ_RUNTIME_SAMPLE_ROWS_MAX;
  const parsed = typeof raw === 'string' ? Number(raw) : NaN;
  const candidate = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RUNTIME_SAMPLE_ROWS_MAX;
  return Math.min(MAX_RUNTIME_SAMPLE_ROWS_MAX, Math.max(1, candidate));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function recordArrayFromJson(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord).map(item => ({ ...item })) : [];
}

function valueAliasesFromJson(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const aliases = stringArrayFromJson(item);
    return key.trim() && aliases.length > 0 ? [[key.trim(), aliases]] : [];
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
