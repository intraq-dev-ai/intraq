import type { IntraQPrismaClient } from '@intraq/db';
import {
  buildDataSource,
  dataSources,
  type DataSourceRecord
} from './foundation-store.js';
import {
  scopedDataSourcesForRead,
  type DataSourceAccessPolicy
} from './source-access.js';
import { isAiReadyDataModel } from './ai-ready-data-model.js';

export interface AnalyzerCatalogSourceResponse {
  id: string;
  name: string;
}

export async function loadAnalyzerCatalogSources(
  prismaClient: IntraQPrismaClient | null,
  access: DataSourceAccessPolicy
): Promise<AnalyzerCatalogSourceResponse[]> {
  const sources = prismaClient
    ? await loadAnalyzerCatalogSourcesFromPrisma(prismaClient)
    : dataSources;
  return scopedDataSourcesForRead(sources, access)
    .filter(source => isVisibleAnalyzerSource(source, access))
    .map((source, index) => ({ source, index }))
    .filter(item => item.source.tables.some(table => isAnalyzerCatalogTable(table, item.source, access)))
    .sort(sortAnalyzerSourceItem)
    .map(({ source }) => analyzerCatalogSourceForResponse(source));
}

async function loadAnalyzerCatalogSourcesFromPrisma(client: IntraQPrismaClient): Promise<DataSourceRecord[]> {
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

function analyzerCatalogSourceForResponse(source: DataSourceRecord): AnalyzerCatalogSourceResponse {
  return {
    id: source.id,
    name: source.name
  };
}

function isAnalyzerCatalogTable(
  sourceTable: DataSourceRecord['tables'][number],
  source: DataSourceRecord,
  access: DataSourceAccessPolicy
): boolean {
  if (source.type === 'api' && isPublicApiAnalyzerClient(access)) {
    return sourceTable.isSelected === true && sourceTable.settings?.isDataModel === true;
  }
  return isAiReadyDataModel(sourceTable);
}

function isVisibleAnalyzerSource(source: DataSourceRecord, access: DataSourceAccessPolicy): boolean {
  if (source.type === 'api' && !isPublicApiAnalyzerClient(access)) return false;
  return dashboardSettings(source).visible !== false;
}

function isPublicApiAnalyzerClient(access: DataSourceAccessPolicy): boolean {
  return access.scope?.authSubjectType === 'public-api-client'
    && access.scope.tokenScopes?.includes('ai-data-analyzer') === true;
}

function sortAnalyzerSourceItem(
  left: { source: DataSourceRecord; index: number },
  right: { source: DataSourceRecord; index: number }
): number {
  const leftDefault = dashboardSettings(left.source).isDefault === true ? 1 : 0;
  const rightDefault = dashboardSettings(right.source).isDefault === true ? 1 : 0;
  return rightDefault - leftDefault || left.index - right.index;
}

function dashboardSettings(source: DataSourceRecord): Record<string, unknown> {
  return readRecord(source.settings.dashboard);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
