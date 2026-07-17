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
  dashboard: UpsertDelegate;
  dashboardCategory: UpsertDelegate;
  dashboardElement: UpsertDelegate;
  dashboardFilter: UpsertDelegate;
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

interface DashboardElementSeed extends Record<string, unknown> {
  id: string;
  layout: Record<string, unknown>;
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
  const dashboardCounts = await seedDashboards(client, index);

  return {
    tenants: baselineTenants.length,
    users: baselineUsers.length,
    dashboardCategories: dashboardCounts.dashboardCategories,
    dashboardElements: dashboardCounts.dashboardElements,
    dashboardFilters: dashboardCounts.dashboardFilters,
    dashboards: dashboardCounts.dashboards,
    dataSources: dataSourceCounts.dataSources,
    dataSourceTables: dataSourceCounts.dataSourceTables,
    metadataDocuments: 0,
    sampleDataRows: dataSourceCounts.sampleDataRows,
    settings: baselineSettings.length,
    systemSettings: baselineSystemSettings.length,
    aiModels: 0
  };
}

async function seedDashboards(client: BaselineSeedClient, index: SeedIndex): Promise<{
  dashboardCategories: number;
  dashboardElements: number;
  dashboardFilters: number;
  dashboards: number;
}> {
  const tenantId = requiredIndex(index.tenantsByDomain, 'local.intraq.test');
  const createdBy = requiredIndex(index.usersByEmail, 'admin@local.intraq.test');
  const categoryId = createStableUuidV7('dashboard-category:Sample Analytics');
  const dashboardId = createStableUuidV7('dashboard:Sample Sales Overview');
  const dataSourceId = createStableUuidV7('data-source:Sample Sales');
  const tableId = createStableUuidV7('data-source-table:Sample Sales:sample_sales_model');
  const tableName = 'sample_sales_model';
  const fields = ['sale_date', 'location', 'category', 'channel', 'orders', 'customers', 'revenue', 'discounts', 'gross_margin', 'avg_order_value'];
  const fieldRoles = {
    sale_date: 'time',
    location: 'dimension',
    category: 'dimension',
    channel: 'dimension',
    orders: 'measure',
    customers: 'measure',
    revenue: 'measure',
    discounts: 'measure',
    gross_margin: 'measure',
    avg_order_value: 'measure'
  };
  const fieldFormats = {
    sale_date: 'date',
    orders: 'number',
    customers: 'number',
    revenue: 'currency',
    discounts: 'currency',
    gross_margin: 'currency',
    avg_order_value: 'currency'
  };

  await client.dashboardCategory.upsert({
    where: { id: categoryId },
    create: {
      id: categoryId,
      name: 'Sample Analytics',
      description: 'Starter dashboards for the bundled sample data.',
      color: '#3152ad',
      icon: 'BarChart3',
      sortOrder: 0,
      isActive: true,
      tenantId,
      createdBy
    },
    update: {
      name: 'Sample Analytics',
      description: 'Starter dashboards for the bundled sample data.',
      color: '#3152ad',
      icon: 'BarChart3',
      sortOrder: 0,
      isActive: true,
      tenantId,
      createdBy
    }
  });

  const elementSeeds = [
    dashboardElement({
      dashboardId,
      dataSourceId,
      fieldFormats,
      fieldRoles,
      fields,
      id: 'sample-sales-kpi-revenue',
      layout: { x: 0, y: 0, w: 2, h: 2 },
      name: 'Total Revenue',
      order: 0,
      tableId,
      tableName,
      type: 'card',
      config: {
        valueField: 'revenue',
        aggregationType: 'sum',
        supportingField: 'orders',
        supportingAggregation: 'sum',
        supportingLabel: 'Orders',
        layoutMode: 'two-row',
        topRowContent: ['title'],
        bottomRowContent: ['value'],
        rowHeightRatio: '0.85fr 1.15fr',
        showTrend: false,
        showIndicator: false,
        valueFontSize: '24px'
      }
    }),
    dashboardElement({
      dashboardId,
      dataSourceId,
      fieldFormats,
      fieldRoles,
      fields,
      id: 'sample-sales-kpi-orders',
      layout: { x: 2, y: 0, w: 2, h: 2 },
      name: 'Total Orders',
      order: 1,
      tableId,
      tableName,
      type: 'card',
      config: {
        valueField: 'orders',
        aggregationType: 'sum',
        supportingField: 'customers',
        supportingAggregation: 'sum',
        supportingLabel: 'Customers',
        layoutMode: 'two-row',
        topRowContent: ['title'],
        bottomRowContent: ['value'],
        rowHeightRatio: '0.85fr 1.15fr',
        showTrend: false,
        showIndicator: false,
        valueFontSize: '24px'
      }
    }),
    dashboardElement({
      dashboardId,
      dataSourceId,
      fieldFormats,
      fieldRoles,
      fields,
      id: 'sample-sales-kpi-margin',
      layout: { x: 0, y: 2, w: 2, h: 2 },
      name: 'Gross Margin',
      order: 2,
      tableId,
      tableName,
      type: 'card',
      config: {
        valueField: 'gross_margin',
        aggregationType: 'sum',
        supportingField: 'discounts',
        supportingAggregation: 'sum',
        supportingLabel: 'Discounts',
        layoutMode: 'two-row',
        topRowContent: ['title'],
        bottomRowContent: ['value'],
        rowHeightRatio: '0.85fr 1.15fr',
        showTrend: false,
        showIndicator: false,
        valueFontSize: '24px'
      }
    }),
    dashboardElement({
      dashboardId,
      dataSourceId,
      fieldFormats,
      fieldRoles,
      fields,
      id: 'sample-sales-kpi-average-sale',
      layout: { x: 2, y: 2, w: 2, h: 2 },
      name: 'Average Sale Value',
      order: 3,
      tableId,
      tableName,
      type: 'card',
      config: {
        valueField: 'avg_order_value',
        aggregationType: 'avg',
        supportingField: 'revenue',
        supportingAggregation: 'sum',
        supportingLabel: 'Revenue',
        layoutMode: 'two-row',
        topRowContent: ['title'],
        bottomRowContent: ['value'],
        rowHeightRatio: '0.85fr 1.15fr',
        showTrend: false,
        showIndicator: false,
        valueFontSize: '24px'
      }
    }),
    dashboardElement({
      chartType: 'line',
      dashboardId,
      dataSourceId,
      fieldFormats,
      fieldRoles,
      fields,
      id: 'sample-sales-revenue-trend',
      layout: { x: 4, y: 0, w: 8, h: 4 },
      name: 'Revenue Trend',
      order: 4,
      tableId,
      tableName,
      type: 'chart',
      config: {
        xField: 'sale_date',
        ySeries: ['revenue', 'gross_margin'],
        ySeriesSummarize: { revenue: 'sum', gross_margin: 'sum' }
      }
    }),
    dashboardElement({
      chartType: 'bar',
      dashboardId,
      dataSourceId,
      fieldFormats,
      fieldRoles,
      fields,
      id: 'sample-sales-channel-revenue',
      layout: { x: 0, y: 4, w: 4, h: 15 },
      name: 'Revenue by Channel',
      order: 5,
      tableId,
      tableName,
      type: 'chart',
      config: {
        xField: 'channel',
        ySeries: ['revenue'],
        ySeriesSummarize: { revenue: 'sum' },
        showLegend: false
      }
    }),
    dashboardElement({
      dashboardId,
      dataSourceId,
      fieldFormats,
      fieldRoles,
      fields,
      id: 'sample-sales-table',
      layout: { x: 4, y: 4, w: 8, h: 15 },
      name: 'Sales by Location and Category',
      order: 6,
      tableId,
      tableName,
      type: 'table',
      config: {
        columns: [
          { field: 'location', label: 'Location' },
          { field: 'category', label: 'Category' },
          { field: 'channel', label: 'Channel' },
          { field: 'orders', label: 'Orders', aggregation: 'sum', format: 'number' },
          { field: 'revenue', label: 'Revenue', aggregation: 'sum', format: 'currency' },
          { field: 'gross_margin', label: 'Gross Margin', aggregation: 'sum', format: 'currency' }
        ],
        rowLimit: 25
      }
    })
  ];
  const filterSeeds = [{
    id: createStableUuidV7('dashboard-filter:Sample Sales Overview:location'),
    dashboardId,
    name: 'Location',
    field: 'location',
    operator: 'in',
    value: [],
    config: {
      dataSourceId,
      dataSourceTableId: tableId,
      tableName,
      label: 'Location',
      sourceField: 'location',
      displayMode: 'multi-select',
      placement: 'bar'
    },
    type: 'interactive',
    isActive: true,
    order: 0
  }];
  const draftLayout = elementSeeds.map(element => ({ id: element.id, ...element.layout }));

  await client.dashboard.upsert({
    where: { id: dashboardId },
    create: {
      id: dashboardId,
      name: 'Sample Sales Overview',
      description: 'Starter dashboard showing revenue, margin, channel mix, and sample sales detail.',
      config: {},
      settings: {
        currencySymbol: '$',
        dataCachePolicy: '15m',
        isFavorite: true,
        menuVisible: true,
        dashboard: { visible: true, starter: true },
        menu: { visible: true },
        navigation: { visible: true }
      },
      isPublic: false,
      isGlobal: false,
      isSample: true,
      section: 'Sample Analytics',
      tenantId,
      createdBy,
      status: 'published',
      draftLayout,
      draftFilters: filterSeeds,
      publishedAt: new Date('2026-06-30T00:00:00.000Z'),
      publishedBy: createdBy,
      categoryId
    },
    update: {
      name: 'Sample Sales Overview',
      description: 'Starter dashboard showing revenue, margin, channel mix, and sample sales detail.',
      config: {},
      settings: {
        currencySymbol: '$',
        dataCachePolicy: '15m',
        isFavorite: true,
        menuVisible: true,
        dashboard: { visible: true, starter: true },
        menu: { visible: true },
        navigation: { visible: true }
      },
      isPublic: false,
      isGlobal: false,
      isSample: true,
      section: 'Sample Analytics',
      tenantId,
      createdBy,
      status: 'published',
      draftLayout,
      draftFilters: filterSeeds,
      publishedAt: new Date('2026-06-30T00:00:00.000Z'),
      publishedBy: createdBy,
      categoryId
    }
  });

  for (const element of elementSeeds) {
    await client.dashboardElement.upsert({
      where: { id: element.id },
      create: element,
      update: element
    });
  }
  for (const filter of filterSeeds) {
    await client.dashboardFilter.upsert({
      where: { id: filter.id },
      create: filter,
      update: filter
    });
  }

  return {
    dashboardCategories: 1,
    dashboardElements: elementSeeds.length,
    dashboardFilters: filterSeeds.length,
    dashboards: 1
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

function dashboardElement(input: {
  chartType?: string;
  config: Record<string, unknown>;
  dashboardId: string;
  dataSourceId: string;
  fieldFormats: Record<string, string>;
  fieldRoles: Record<string, string>;
  fields: string[];
  id: string;
  layout: Record<string, unknown>;
  name: string;
  order: number;
  tableId: string;
  tableName: string;
  type: string;
}): DashboardElementSeed {
  const id = createStableUuidV7(`dashboard-element:Sample Sales Overview:${input.id}`);
  const config = {
    title: input.name,
    dataSourceId: input.dataSourceId,
    dataSourceName: 'Sample Sales',
    dataSourceTableId: input.tableId,
    tableName: input.tableName,
    dataModelName: 'Sales',
    fields: input.fields,
    fieldRoles: input.fieldRoles,
    fieldFormats: input.fieldFormats,
    ...input.config
  };
  return {
    id,
    dashboardId: input.dashboardId,
    dataSourceId: input.dataSourceId,
    name: input.name,
    type: input.type,
    ...(input.chartType ? { chartType: input.chartType } : {}),
    layout: { i: id, ...input.layout },
    config,
    query: null,
    isVisible: true,
    order: input.order
  };
}
