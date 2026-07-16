export interface TemplateCardDefinition {
  label: string;
  value: number;
}

export interface TemplatePreviewItem {
  type: 'area' | 'bar' | 'card' | 'column' | 'doughnut' | 'line' | 'matrix' | 'stack' | 'table' | 'pie';
  span: number;
  cardIndex?: number;
  columnStart?: number;
  rowStart?: number;
  rowSpan?: number;
  variant?: 'heatmap' | 'multi-column' | 'multi-row' | 'professional';
  tableStyle?: 'alternate';
}

export interface DashboardTemplateDefinition {
  id: string;
  title: string;
  subtitle: string;
  cards: TemplateCardDefinition[];
  defaults: {
    chartTypes: string[];
    dashboardScope: 'comprehensive';
  };
  previewLayout: TemplatePreviewItem[];
}

export const dashboardTemplateDefinitions: DashboardTemplateDefinition[] = [
  {
    id: 'sales_performance',
    title: 'Sales Performance',
    subtitle: 'Revenue trend with category comparison and detailed sales table.',
    cards: [
      { label: 'Gross Sales', value: 92300 },
      { label: 'Net Sales', value: 84100 },
      { label: 'Orders', value: 3610 }
    ],
    defaults: { chartTypes: ['card', 'line', 'bar', 'table'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'card', cardIndex: 0, span: 4 },
      { type: 'card', cardIndex: 1, span: 4 },
      { type: 'card', cardIndex: 2, span: 4 },
      { type: 'line', span: 6 },
      { type: 'bar', span: 6 },
      { type: 'table', span: 12 }
    ]
  },
  {
    id: 'revenue_signals',
    title: 'Revenue Signals',
    subtitle: 'Compact KPIs, heat map center, and an area trend below.',
    cards: [
      { label: 'Revenue', value: 128400 },
      { label: 'Orders', value: 4820 },
      { label: 'Avg. Ticket', value: 27.4 },
      { label: 'Conversion', value: 4.2 },
      { label: 'Units Sold', value: 18400 },
      { label: 'New Users', value: 920 },
      { label: 'Returning', value: 3120 },
      { label: 'Returns', value: 230 },
      { label: 'Churn', value: 2.1 },
      { label: 'Upsell', value: 740 }
    ],
    defaults: { chartTypes: ['card', 'matrix', 'area'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'card', cardIndex: 0, span: 2, rowStart: 1, columnStart: 1 },
      { type: 'stack', span: 8, rowStart: 1, rowSpan: 5, columnStart: 3, variant: 'heatmap' },
      { type: 'card', cardIndex: 1, span: 2, rowStart: 1, columnStart: 11 },
      { type: 'card', cardIndex: 2, span: 2, rowStart: 2, columnStart: 1 },
      { type: 'card', cardIndex: 3, span: 2, rowStart: 2, columnStart: 11 },
      { type: 'card', cardIndex: 4, span: 2, rowStart: 3, columnStart: 1 },
      { type: 'card', cardIndex: 5, span: 2, rowStart: 3, columnStart: 11 },
      { type: 'card', cardIndex: 6, span: 2, rowStart: 4, columnStart: 1 },
      { type: 'card', cardIndex: 7, span: 2, rowStart: 4, columnStart: 11 },
      { type: 'card', cardIndex: 8, span: 2, rowStart: 5, columnStart: 1 },
      { type: 'card', cardIndex: 9, span: 2, rowStart: 5, columnStart: 11 }
    ]
  },
  {
    id: 'trendline_matrix',
    title: 'Trendline Matrix',
    subtitle: 'Multi-line trends with a detailed table and heat map.',
    cards: [],
    defaults: { chartTypes: ['line', 'table', 'matrix'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'line', span: 12 },
      { type: 'table', span: 12 },
      { type: 'matrix', span: 12, variant: 'heatmap' }
    ]
  },
  {
    id: 'multi_bar_pulse',
    title: 'Multi Bar Pulse',
    subtitle: 'Four bar charts across two rows for quick comparisons.',
    cards: [],
    defaults: { chartTypes: ['bar'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'bar', span: 6 },
      { type: 'bar', span: 6 },
      { type: 'bar', span: 6 },
      { type: 'bar', span: 6 }
    ]
  },
  {
    id: 'category_drivers',
    title: 'Category Drivers',
    subtitle: 'Category bars with pie/donut breakdowns and a detail table.',
    cards: [],
    defaults: { chartTypes: ['bar', 'pie', 'doughnut', 'table'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'bar', span: 12 },
      { type: 'pie', span: 6 },
      { type: 'doughnut', span: 6 },
      { type: 'table', span: 12 }
    ]
  },
  {
    id: 'heat_map_depth',
    title: 'Heat Map Depth',
    subtitle: 'Deep matrix view with multi-row focus and a supporting table.',
    cards: [],
    defaults: { chartTypes: ['matrix', 'table'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'matrix', span: 12, variant: 'multi-row' },
      { type: 'table', span: 12 }
    ]
  },
  {
    id: 'operational_grid',
    title: 'Operational Grid',
    subtitle: 'Expandable matrix with area and line trends.',
    cards: [],
    defaults: { chartTypes: ['matrix', 'area', 'line'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'matrix', span: 12, variant: 'multi-column' },
      { type: 'area', span: 6 },
      { type: 'line', span: 6 }
    ]
  },
  {
    id: 'executive_blend',
    title: 'Executive Blend',
    subtitle: 'Three KPIs, column + line combo, and a detailed table.',
    cards: [
      { label: 'Revenue', value: 84200 },
      { label: 'Orders', value: 3120 },
      { label: 'Avg. Order', value: 27.0 }
    ],
    defaults: { chartTypes: ['card', 'column', 'line', 'table'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'card', cardIndex: 0, span: 4 },
      { type: 'card', cardIndex: 1, span: 4 },
      { type: 'card', cardIndex: 2, span: 4 },
      { type: 'column', span: 6 },
      { type: 'line', span: 6 },
      { type: 'table', span: 12 }
    ]
  },
  {
    id: 'sales_mix_snapshot',
    title: 'Sales Mix Snapshot',
    subtitle: 'Pie + donut mix, bar summary, and detail table.',
    cards: [],
    defaults: { chartTypes: ['doughnut', 'pie', 'bar', 'table'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'doughnut', span: 6 },
      { type: 'pie', span: 6 },
      { type: 'bar', span: 12 },
      { type: 'table', span: 12 }
    ]
  },
  {
    id: 'product_momentum',
    title: 'Product Momentum',
    subtitle: 'Line trend, column + area comparison, and heat map.',
    cards: [],
    defaults: { chartTypes: ['line', 'column', 'area', 'matrix'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'line', span: 12 },
      { type: 'column', span: 6 },
      { type: 'area', span: 6 },
      { type: 'matrix', span: 12, variant: 'heatmap' }
    ]
  },
  {
    id: 'insight_matrix',
    title: 'Insight Matrix',
    subtitle: 'Professional heat map with an alternate-row table.',
    cards: [],
    defaults: { chartTypes: ['matrix', 'table'], dashboardScope: 'comprehensive' },
    previewLayout: [
      { type: 'matrix', span: 12, variant: 'professional' },
      { type: 'table', span: 12, tableStyle: 'alternate' }
    ]
  }
];

export function getDashboardTemplateDefinition(templateId: string): DashboardTemplateDefinition {
  const fallback = dashboardTemplateDefinitions[0];
  if (!fallback) throw new Error('Dashboard template definitions are not configured.');
  return dashboardTemplateDefinitions.find(template => template.id === templateId) ?? fallback;
}
