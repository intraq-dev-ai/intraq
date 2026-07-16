import {
  baselineSettings,
  baselineSystemSettings,
  baselineTenants,
  baselineUsers,
  baselineDataSources,
  demoPasswordHash
} from './baseline-data.js';
import { createStableUuidV7, createUuidV7, type IdFactory } from './uuid-v7.js';

type JsonValue = unknown;

interface UpsertDelegate {
  upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
}

interface BaselineSeedClient {
  dataSource: UpsertDelegate;
  dataSourceTable: UpsertDelegate;
  sampleDataRow: UpsertDelegate;
  setting: UpsertDelegate;
  systemSetting: UpsertDelegate;
  tenant: UpsertDelegate;
  user: UpsertDelegate;
}

export interface BaselineSeedOptions {
  idFactory?: IdFactory;
}

interface SeedIndex {
  tenantsByDomain: Map<string, string>;
  usersByEmail: Map<string, string>;
}

export interface BaselineSeedResult {
  aiModels: number;
  dashboardCategories: number;
  dashboardElements: number;
  dashboardFilters: number;
  dashboards: number;
  dataSources: number;
  dataSourceTables: number;
  metadataDocuments: number;
  sampleDataRows: number;
  settings: number;
  systemSettings: number;
  tenants: number;
  users: number;
}

export async function seedBaseline(client: BaselineSeedClient, options: BaselineSeedOptions = {}): Promise<BaselineSeedResult> {
  const idFactory = options.idFactory ?? createUuidV7;
  const index: SeedIndex = {
    tenantsByDomain: new Map(),
    usersByEmail: new Map()
  };

  await seedTenants(client, idFactory, index);
  await seedUsers(client, idFactory, index);
  await seedSettings(client, idFactory);
  const dataSourceCounts = await seedDataSources(client);

  return {
    tenants: baselineTenants.length,
    users: baselineUsers.length,
    dashboardCategories: 0,
    dashboardElements: 0,
    dashboardFilters: 0,
    dashboards: 0,
    dataSources: dataSourceCounts.dataSources,
    dataSourceTables: dataSourceCounts.dataSourceTables,
    metadataDocuments: 0,
    sampleDataRows: dataSourceCounts.sampleDataRows,
    settings: baselineSettings.length,
    systemSettings: baselineSystemSettings.length,
    aiModels: 0
  };
}

async function seedTenants(client: BaselineSeedClient, idFactory: IdFactory, index: SeedIndex): Promise<void> {
  for (const tenant of baselineTenants) {
    const created = await client.tenant.upsert({
      where: { domain: tenant.domain },
      create: { id: idFactory(), ...tenant, status: 'active' },
      update: { ...tenant, status: 'active' }
    });
    index.tenantsByDomain.set(tenant.domain, stringField(created, 'id'));
  }
}

async function seedUsers(client: BaselineSeedClient, idFactory: IdFactory, index: SeedIndex): Promise<void> {
  for (const user of baselineUsers) {
    const tenantId = user.tenantDomain ? requiredIndex(index.tenantsByDomain, user.tenantDomain) : null;
    const created = await client.user.upsert({
      where: { email: user.email },
      create: {
        id: idFactory(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        password: demoPasswordHash,
        role: user.role,
        tenantId,
        isActive: user.isActive,
        emailVerified: user.emailVerified
      },
      update: {
        firstName: user.firstName,
        lastName: user.lastName,
        password: demoPasswordHash,
        role: user.role,
        tenantId,
        isActive: user.isActive,
        emailVerified: user.emailVerified
      }
    });
    index.usersByEmail.set(user.email, stringField(created, 'id'));
  }
}

async function seedSettings(client: BaselineSeedClient, idFactory: IdFactory): Promise<void> {
  for (const setting of baselineSettings) {
    const id = createStableUuidV7(`setting:${setting.key}:global`);
    await client.setting.upsert({
      where: { id },
      create: { id, key: setting.key, value: setting.value, tenantId: null },
      update: { value: setting.value }
    });
  }

  for (const setting of baselineSystemSettings) {
    await client.systemSetting.upsert({
      where: { key: setting.key },
      create: { id: idFactory(), key: setting.key, value: String(setting.value), category: setting.category ?? 'general', description: setting.description },
      update: { value: String(setting.value), category: setting.category ?? 'general', description: setting.description }
    });
  }
}

async function seedDataSources(client: BaselineSeedClient): Promise<{
  dataSources: number;
  dataSourceTables: number;
  sampleDataRows: number;
}> {
  let dataSourceCount = 0;
  let tableCount = 0;
  let rowCount = 0;

  for (const source of baselineDataSources) {
    const sourceSeedKey = source.seedKey ?? source.name;
    const sourceId = createStableUuidV7(`data-source:${sourceSeedKey}`);
    await client.dataSource.upsert({
      where: { id: sourceId },
      create: {
        id: sourceId,
        name: source.name,
        description: source.description,
        type: source.type,
        sourceType: source.sourceType,
        config: source.config,
        settings: source.settings,
        dictionary: source.dictionary,
        isActive: true,
        isGlobal: source.isGlobal,
        isGloballyVisible: source.isGloballyVisible,
        isSample: source.isSample,
        tenantId: null,
        createdBy: null
      },
      update: {
        name: source.name,
        description: source.description,
        type: source.type,
        sourceType: source.sourceType,
        config: source.config,
        settings: source.settings,
        dictionary: source.dictionary,
        isActive: true,
        isGlobal: source.isGlobal,
        isGloballyVisible: source.isGloballyVisible,
        isSample: source.isSample,
        tenantId: null,
        createdBy: null
      }
    });
    dataSourceCount += 1;

    for (const table of source.tables) {
      const tableId = createStableUuidV7(`data-source-table:${sourceSeedKey}:${table.name}`);
      await client.dataSourceTable.upsert({
        where: { id: tableId },
        create: {
          id: tableId,
          name: table.name,
          dataSourceId: sourceId,
          description: table.description,
          fields: table.fields,
          settings: table.settings,
          dictionary: table.dictionary,
          isSelected: table.isSelected
        },
        update: {
          name: table.name,
          dataSourceId: sourceId,
          description: table.description,
          fields: table.fields,
          settings: table.settings,
          dictionary: table.dictionary,
          isSelected: table.isSelected
        }
      });
      tableCount += 1;

      for (const [index, row] of table.sampleRows.entries()) {
        const rowId = createStableUuidV7(`sample-data-row:${sourceSeedKey}:${table.name}:${index}`);
        await client.sampleDataRow.upsert({
          where: { id: rowId },
          create: {
            id: rowId,
            tableId,
            data: row
          },
          update: {
            tableId,
            data: row
          }
        });
        rowCount += 1;
      }
    }
  }

  return {
    dataSources: dataSourceCount,
    dataSourceTables: tableCount,
    sampleDataRows: rowCount
  };
}

function stringField(record: Record<string, JsonValue>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string') throw new Error(`Seed upsert result did not include string field ${field}.`);
  return value;
}

function requiredIndex(index: Map<string, string>, key: string): string {
  const value = index.get(key);
  if (!value) throw new Error(`Missing seed dependency: ${key}`);
  return value;
}
