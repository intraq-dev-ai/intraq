import {
  createDashboard,
  createDashboardElement
} from '../dashboard-builder/api';
import type {
  BuilderDataField,
  BuilderDataSource,
  BuilderDataTable,
  Dashboard
} from '../dashboard-builder/types';
import type {
  DashboardTemplateDefinition,
  TemplateCardDefinition,
  TemplatePreviewItem
} from './template-definitions';

interface TemplateElementInput {
  chartType?: string;
  config: Record<string, unknown>;
  dataSourceId: string;
  layout: Record<string, number>;
  name: string;
  type: string;
}

interface FieldProfile {
  columnField: string;
  dateField: string;
  dimensionField: string;
  measureFields: string[];
  tableColumns: string[];
}

interface LayoutCursor {
  cursorX: number;
  cursorY: number;
  rowHeight: number;
}

const GRID_COLUMNS = 12;

export async function createDashboardFromTemplate(input: {
  dataSource: BuilderDataSource;
  table: BuilderDataTable;
  template: DashboardTemplateDefinition;
}): Promise<Dashboard> {
  const dashboard = await createDashboard(input.template.title);
  const fields = profileFields(input.table);
  const elements = templateElements(input.template, input.dataSource, input.table, fields);
  for (const element of elements) await createDashboardElement(dashboard.id, element);
  return dashboard;
}

function templateElements(
  template: DashboardTemplateDefinition,
  source: BuilderDataSource,
  table: BuilderDataTable,
  fields: FieldProfile
): TemplateElementInput[] {
  const elements: TemplateElementInput[] = [];
  const cursor: LayoutCursor = { cursorX: 0, cursorY: 0, rowHeight: 0 };
  template.previewLayout.forEach((item, index) => {
    const layout = layoutForItem(item, cursor);
    if (item.type === 'stack') {
      const matrixHeight = Math.max(6, layout.h - 3);
      elements.push(matrixElement(template, source, table, fields, {
        ...layout,
        h: matrixHeight
      }, index));
      elements.push(chartElement('area', 'Area Trend', source, table, fields, {
        x: layout.x,
        y: layout.y + matrixHeight,
        w: layout.w,
        h: 3
      }, index + 0.5));
      return;
    }
    elements.push(elementForItem(item, template, source, table, fields, layout, index));
  });
  return elements;
}

function elementForItem(
  item: TemplatePreviewItem,
  template: DashboardTemplateDefinition,
  source: BuilderDataSource,
  table: BuilderDataTable,
  fields: FieldProfile,
  layout: Record<string, number>,
  index: number
): TemplateElementInput {
  if (item.type === 'card') return cardElement(cardFor(template, item), source, table, fields, layout, index);
  if (item.type === 'matrix') return matrixElement(template, source, table, fields, layout, index, item.variant);
  if (item.type === 'table') return tableElement(source, table, fields, layout, index, item.tableStyle === 'alternate');
  return chartElement(item.type, chartTitle(item.type), source, table, fields, layout, index);
}

function baseConfig(source: BuilderDataSource, table: BuilderDataTable, title: string): Record<string, unknown> {
  return {
    dataSourceId: source.id,
    dataSourceTableId: table.id,
    dataModelName: table.name,
    tableName: table.name,
    title
  };
}

function cardElement(
  card: TemplateCardDefinition,
  source: BuilderDataSource,
  table: BuilderDataTable,
  fields: FieldProfile,
  layout: Record<string, number>,
  index: number
): TemplateElementInput {
  const metric = fields.measureFields[index % fields.measureFields.length] ?? fields.measureFields[0];
  return {
    dataSourceId: source.id,
    layout,
    name: card.label,
    type: 'card',
    config: {
      ...baseConfig(source, table, card.label),
      aggregationType: 'sum',
      cardType: 'two-row',
      enableTwoRowLayout: true,
      outerGap: 'none',
      rowHeightRatio: '50-50',
      titleBackground: '#dbeafe',
      titleColor: '#1e3a8a',
      topRowContent: 'title',
      valueBackground: '#ffffff',
      valueColor: '#0f172a',
      valueField: metric,
      yField: metric,
      ySeries: [metric],
      ySeriesSummarize: { [metric]: 'sum' }
    }
  };
}

function chartElement(
  type: TemplatePreviewItem['type'],
  title: string,
  source: BuilderDataSource,
  table: BuilderDataTable,
  fields: FieldProfile,
  layout: Record<string, number>,
  index: number
): TemplateElementInput {
  const chartType = type === 'doughnut' ? 'doughnut' : type;
  const measure = fields.measureFields[Math.floor(index) % fields.measureFields.length] ?? fields.measureFields[0];
  const xField = type === 'line' || type === 'area' || type === 'column' ? fields.dateField : fields.dimensionField;
  return {
    chartType,
    dataSourceId: source.id,
    layout,
    name: title,
    type: 'chart',
    config: {
      ...baseConfig(source, table, title),
      chartType,
      showXAxis: type !== 'pie' && type !== 'doughnut',
      showYAxis: type !== 'pie' && type !== 'doughnut',
      type: chartType,
      valueField: measure,
      xAxisLabel: labelForField(xField),
      xField,
      yAxisLabel: labelForField(measure),
      ySeries: [measure],
      ySeriesSummarize: { [measure]: 'sum' }
    }
  };
}

function matrixElement(
  template: DashboardTemplateDefinition,
  source: BuilderDataSource,
  table: BuilderDataTable,
  fields: FieldProfile,
  layout: Record<string, number>,
  index: number,
  variant: TemplatePreviewItem['variant'] = 'heatmap'
): TemplateElementInput {
  const measure = fields.measureFields[index % fields.measureFields.length] ?? fields.measureFields[0];
  return {
    dataSourceId: source.id,
    layout,
    name: template.id === 'revenue_signals' ? 'Revenue Heat Map' : chartTitle('matrix'),
    type: 'matrix',
    config: {
      ...baseConfig(source, table, chartTitle('matrix')),
      columnFields: [{ field: fields.columnField, label: labelForField(fields.columnField) }],
      conditionalFormatting: [{
        applyTo: 'values',
        autoTextColor: true,
        colorScale: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#6c8eee', '#3152ad'],
        field: measure,
        formatType: 'colorScale',
        scope: 'cell',
        valueFields: [measure]
      }],
      enableColumnExpandCollapse: variant === 'multi-column',
      enableRowExpandCollapse: variant === 'multi-row',
      rowFields: [{ field: fields.dimensionField, label: labelForField(fields.dimensionField) }],
      showBorders: true,
      showColumnTotals: false,
      showRowTotals: true,
      valueFields: [{ field: measure, label: labelForField(measure), summarize: 'sum' }]
    }
  };
}

function tableElement(
  source: BuilderDataSource,
  table: BuilderDataTable,
  fields: FieldProfile,
  layout: Record<string, number>,
  index: number,
  alternateRows: boolean
): TemplateElementInput {
  return {
    dataSourceId: source.id,
    layout,
    name: 'Detail Table',
    type: 'table',
    config: {
      ...baseConfig(source, table, 'Detail Table'),
      columns: fields.tableColumns.map(field => ({ field, label: labelForField(field) })),
      rowStyle: alternateRows ? 'striped' : 'default',
      tableStyle: alternateRows ? 'striped' : 'default'
    }
  };
}

function layoutForItem(item: TemplatePreviewItem, cursor: LayoutCursor): Record<string, number> {
  const w = Math.min(GRID_COLUMNS, Math.max(2, item.span));
  const h = heightForItem(item);
  if (item.columnStart || item.rowStart) {
    const layout = {
      x: Math.min(GRID_COLUMNS - w, Math.max(0, (item.columnStart ?? 1) - 1)),
      y: Math.max(0, ((item.rowStart ?? 1) - 1) * 3),
      w,
      h
    };
    cursor.cursorY = Math.max(cursor.cursorY, layout.y + layout.h);
    return layout;
  }

  if (cursor.cursorX > 0 && cursor.cursorX + w > GRID_COLUMNS) {
    cursor.cursorX = 0;
    cursor.cursorY += cursor.rowHeight;
    cursor.rowHeight = 0;
  }
  const layout = { x: cursor.cursorX, y: cursor.cursorY, w, h };
  cursor.cursorX += w;
  cursor.rowHeight = Math.max(cursor.rowHeight, h);
  if (cursor.cursorX >= GRID_COLUMNS) {
    cursor.cursorX = 0;
    cursor.cursorY += cursor.rowHeight;
    cursor.rowHeight = 0;
  }
  return layout;
}

function heightForItem(item: TemplatePreviewItem): number {
  if (item.rowSpan) return item.rowSpan * 3;
  if (item.type === 'card') return 3;
  if (item.type === 'table') return 8;
  return 6;
}

function profileFields(table: BuilderDataTable): FieldProfile {
  const fields = table.fields.length ? table.fields : [{ name: 'metric', type: 'number' }];
  const names = fields.map(field => field.name);
  const measures = fields.filter(isMeasureField).map(field => field.name);
  const dimensions = fields.filter(field => !isMeasureField(field)).map(field => field.name);
  const date = fields.find(isDateField)?.name ?? dimensions[0] ?? names[0];
  const dimension = dimensions.find(field => field !== date) ?? dimensions[0] ?? names[0];
  const column = dimensions.find(field => field !== date && field !== dimension) ?? date;
  return {
    columnField: column,
    dateField: date,
    dimensionField: dimension,
    measureFields: measures.length ? measures : [names[0]],
    tableColumns: names.slice(0, 6)
  };
}

function isMeasureField(field: BuilderDataField): boolean {
  const text = `${field.type} ${field.dataType ?? ''} ${field.columnType ?? ''} ${field.role ?? ''} ${field.semanticRole ?? ''} ${field.name}`.toLowerCase();
  return /number|numeric|decimal|double|float|int|bigint|currency|amount|sales|revenue|total|count|qty|quantity|price|cost|margin|metric|measure/.test(text);
}

function isDateField(field: BuilderDataField): boolean {
  const text = `${field.type} ${field.dataType ?? ''} ${field.dateRole ?? ''} ${field.name}`.toLowerCase();
  return /date|time|day|month|week|year|timestamp/.test(text);
}

function cardFor(template: DashboardTemplateDefinition, item: TemplatePreviewItem): TemplateCardDefinition {
  return template.cards[item.cardIndex ?? 0] ?? { label: 'Metric', value: 0 };
}

function chartTitle(type: TemplatePreviewItem['type']): string {
  const labels: Partial<Record<TemplatePreviewItem['type'], string>> = {
    area: 'Area Trend',
    bar: 'Category Comparison',
    column: 'Column Comparison',
    doughnut: 'Mix Breakdown',
    line: 'Trend',
    matrix: 'Heat Map',
    pie: 'Share Breakdown'
  };
  return labels[type] ?? 'Dashboard Component';
}

function labelForField(field: string): string {
  return field
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
