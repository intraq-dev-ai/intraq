export interface BaselineTenant {
  contactEmail: string;
  contactName: string;
  domain: string;
  hostType: 'self-hosted';
  maxDashboards: number;
  maxDataSources: number;
  maxUsers: number;
  name: string;
  settings: Record<string, unknown>;
  tenantType: 'single';
  type: 'REGULAR';
}

export interface BaselineUser {
  email: string;
  emailVerified: boolean;
  firstName: string;
  isActive: boolean;
  lastName: string;
  role: string;
  tenantDomain?: string;
}

export interface BaselineSetting {
  category?: string;
  description?: string;
  key: string;
  value: Record<string, unknown> | string;
}

export interface BaselineDataField {
  aliases?: string[];
  columnType?: string;
  defaultAggregation?: string;
  description: string;
  dictionaryDescription: string;
  format?: string;
  label: string;
  name: string;
  role?: string;
  sampleQuestions?: string[];
  sampleValues?: unknown[];
  semanticRole?: string;
  type: string;
  valueAliases?: Record<string, string[]>;
}

export interface BaselineDataTable {
  description: string;
  dictionary: Record<string, unknown>;
  fields: BaselineDataField[];
  isSelected: boolean;
  name: string;
  sampleRows: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}

export interface BaselineDataSource {
  config: Record<string, unknown>;
  description: string;
  dictionary: Record<string, unknown>;
  isGlobal: boolean;
  isGloballyVisible: boolean;
  isSample: boolean;
  name: string;
  seedKey?: string;
  settings: Record<string, unknown>;
  sourceType: string;
  tables: BaselineDataTable[];
  type: string;
}

export const demoPasswordHash = 'scrypt$16384$8$1$aW50cmFxLWRlbW8tc2VlZA==$8SUH9zkPbpRS5Ip9ACcy9Yo/nzKqhJFs4XkcsnVCDKfzH5Qgg4a+sIkNOMV1qfjL/AXm9vlOQmz/pVr7GvTKqg==';

export const baselineTenants: BaselineTenant[] = [
  {
    name: 'intraQ',
    domain: 'local.intraq.test',
    contactEmail: 'admin@local.intraq.test',
    contactName: 'intraQ Admin',
    tenantType: 'single',
    type: 'REGULAR',
    hostType: 'self-hosted',
    maxUsers: 25,
    maxDashboards: 25,
    maxDataSources: 10,
    settings: {
      branding: {
        accentColor: '#6c8eee',
        brandHeader: 'intraQ',
        brandSubHeader: '',
        gradientEnd: '#3152ad',
        gradientStart: '#6c8eee',
        primaryColor: '#3152ad'
      },
      seedOnly: true
    }
  }
];

export const baselineUsers: BaselineUser[] = [
  {
    email: 'admin@local.intraq.test',
    firstName: 'intraQ',
    lastName: 'Admin',
    role: 'SINGLE_TENANT_OWNER',
    tenantDomain: 'local.intraq.test',
    isActive: true,
    emailVerified: true
  }
];

export const baselineSystemSettings: BaselineSetting[] = [
  {
    key: 'deploymentType',
    value: 'source',
    category: 'system',
    description: 'Seed deployment marker.'
  }
];

export const baselineSettings: BaselineSetting[] = [
  {
    key: 'ai.metadata',
    value: { enabled: true, seededBy: '@intraq/db' }
  }
];

export const baselineDataSources: BaselineDataSource[] = [
  {
    name: 'Sample Sales',
    seedKey: 'Sample Sales',
    description: 'Generic sample sales data for trying dashboards, Analyzer, and MCP.',
    type: 'sample',
    sourceType: 'source',
    config: { runtime: 'sample' },
    settings: { sample: true, dashboardReady: true },
    dictionary: {
      businessName: 'Sample Sales',
      sampleQuestions: [
        'How is revenue trending?',
        'Which category has the highest revenue?',
        'Compare direct, online, and partner sales.'
      ]
    },
    isGlobal: true,
    isGloballyVisible: true,
    isSample: true,
    tables: [
      {
        name: 'sample_sales_model',
        description: 'Dashboard-ready sample sales model with daily revenue, orders, margin, and channel metrics.',
        isSelected: true,
        settings: {
          isDataModel: true,
          primaryDateField: 'sale_date',
          targetType: 'data_model'
        },
        dictionary: {
          businessName: 'Sales',
          targetType: 'data_model',
          sampleQuestions: [
            'Show revenue by day.',
            'Show revenue by category and channel.',
            'Which locations are underperforming?'
          ]
        },
        fields: [
          field('sale_date', 'date', 'Sale Date', 'Date of the sales activity.', 'dimension', 'date'),
          field('location', 'string', 'Location', 'Business location or region.', 'dimension', 'category', ['North', 'Central', 'West']),
          field('category', 'string', 'Category', 'Product or service category.', 'dimension', 'category', ['Product', 'Subscription', 'Services']),
          withFieldMetadata(
            field('channel', 'string', 'Channel', 'Sales channel such as direct, online, or partner.', 'dimension', 'category', ['Direct', 'Online', 'Partner'], [
              'sales route',
              'route to market',
              'sales channel',
              'service type',
              'fulfilment type'
            ]),
            {
              sampleQuestions: ['Compare direct vs online revenue.'],
              valueAliases: {
                Direct: ['direct', 'sales rep', 'field sales'],
                Online: ['online', 'web', 'ecommerce'],
                Partner: ['partner', 'reseller', 'channel partner']
              }
            }
          ),
          withFieldMetadata(field('orders', 'number', 'Orders', 'Number of orders.', 'measure', 'number', [], [
            'order count',
            'transactions'
          ]), { defaultAggregation: 'sum' }),
          field('customers', 'number', 'Customers', 'Number of customers served.', 'measure', 'number'),
          withFieldMetadata(field('revenue', 'number', 'Revenue', 'Net revenue after refunds.', 'measure', 'currency', [], [
            'sales',
            'takings',
            'gross sales'
          ]), {
            defaultAggregation: 'sum',
            sampleQuestions: ['Total revenue by channel.']
          }),
          withFieldMetadata(field('discounts', 'number', 'Discounts', 'Discount value applied to sales.', 'measure', 'currency', [], [
            'discount amount'
          ]), { defaultAggregation: 'sum' }),
          withFieldMetadata(field('gross_margin', 'number', 'Gross Margin', 'Gross margin value.', 'measure', 'currency', [], [
            'margin',
            'profit'
          ]), { defaultAggregation: 'sum' }),
          withFieldMetadata(field('avg_order_value', 'number', 'Average Order Value', 'Average revenue per order.', 'measure', 'currency', [], [
            'aov',
            'average ticket',
            'avg ticket'
          ]), { defaultAggregation: 'avg' })
        ],
        sampleRows: [
          sampleSalesRow('2026-06-01', 'Central', 'Product', 'Direct', 128, 214, 5275, 210, 3360, 41.21),
          sampleSalesRow('2026-06-01', 'Central', 'Subscription', 'Online', 84, 99, 1840, 95, 1215, 21.90),
          sampleSalesRow('2026-06-01', 'North', 'Product', 'Partner', 96, 142, 3920, 180, 2380, 40.83),
          sampleSalesRow('2026-06-02', 'Central', 'Product', 'Direct', 141, 228, 5815, 240, 3715, 41.24),
          sampleSalesRow('2026-06-02', 'North', 'Subscription', 'Online', 76, 88, 1665, 75, 1095, 21.91),
          sampleSalesRow('2026-06-02', 'West', 'Services', 'Partner', 42, 51, 2140, 115, 1280, 50.95),
          sampleSalesRow('2026-06-03', 'Central', 'Services', 'Direct', 58, 75, 2890, 130, 1765, 49.83),
          sampleSalesRow('2026-06-03', 'North', 'Product', 'Direct', 118, 194, 5010, 205, 3195, 42.46),
          sampleSalesRow('2026-06-03', 'West', 'Subscription', 'Online', 69, 81, 1515, 70, 990, 21.96),
          sampleSalesRow('2026-06-04', 'Central', 'Product', 'Partner', 103, 151, 4235, 195, 2580, 41.12),
          sampleSalesRow('2026-06-04', 'North', 'Services', 'Direct', 61, 78, 3055, 140, 1875, 50.08),
          sampleSalesRow('2026-06-04', 'West', 'Product', 'Online', 91, 123, 3295, 150, 2075, 36.21),
          sampleSalesRow('2026-06-05', 'Central', 'Subscription', 'Direct', 97, 136, 2255, 100, 1495, 23.25),
          sampleSalesRow('2026-06-05', 'North', 'Product', 'Partner', 110, 165, 4560, 215, 2795, 41.45),
          sampleSalesRow('2026-06-05', 'West', 'Services', 'Online', 47, 57, 2365, 120, 1435, 50.32),
          sampleSalesRow('2026-06-06', 'Central', 'Product', 'Direct', 163, 261, 6750, 275, 4320, 41.41),
          sampleSalesRow('2026-06-06', 'North', 'Subscription', 'Partner', 88, 103, 1925, 85, 1270, 21.88),
          sampleSalesRow('2026-06-06', 'West', 'Product', 'Direct', 132, 206, 5420, 220, 3415, 41.06)
        ]
      }
    ]
  }
];

function field(
  name: string,
  type: string,
  label: string,
  description: string,
  role: 'dimension' | 'measure',
  semanticRole: string,
  sampleValues: unknown[] = [],
  aliases: string[] = []
): BaselineDataField {
  return {
    name,
    type,
    label,
    description,
    dictionaryDescription: description,
    ...(aliases.length ? { aliases } : {}),
    role,
    semanticRole,
    ...(type === 'number' ? { columnType: 'number' } : {}),
    ...(type === 'date' ? { columnType: 'date' } : {}),
    ...(semanticRole === 'currency' ? { format: 'currency' } : {}),
    ...(sampleValues.length ? { sampleValues } : {})
  };
}

function withFieldMetadata(
  base: BaselineDataField,
  metadata: Pick<BaselineDataField, 'defaultAggregation' | 'sampleQuestions' | 'valueAliases'>
): BaselineDataField {
  return {
    ...base,
    ...metadata
  };
}

function sampleSalesRow(
  saleDate: string,
  location: string,
  category: string,
  channel: string,
  orders: number,
  customers: number,
  revenue: number,
  discounts: number,
  grossMargin: number,
  avgOrderValue: number
): Record<string, unknown> {
  return {
    sale_date: saleDate,
    location,
    category,
    channel,
    orders,
    customers,
    revenue,
    discounts,
    gross_margin: grossMargin,
    avg_order_value: avgOrderValue
  };
}
