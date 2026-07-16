import {
  MCP_WORKFLOW_TOOL_DEFINITIONS
} from './workflow-tool-definitions.js';
import {
  MCP_PRODUCT_API_TOOL_DEFINITIONS
} from './product-api-tools.js';
import type { McpToolDefinition } from './route-types.js';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    description: 'Check whether the intraQ API MCP endpoint is reachable for this token.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    name: 'get_system_status',
    scope: 'status:read'
  },
  {
    description: 'List dashboards visible to the authenticated intraQ user.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100 },
        status: { type: 'string', enum: ['draft', 'published'] }
      },
      additionalProperties: false
    },
    name: 'list_dashboards',
    scope: 'dashboards:read'
  },
  {
    description: 'Read a dashboard summary, including its elements and filters.',
    inputSchema: {
      type: 'object',
      properties: { dashboardId: { type: 'string' } },
      required: ['dashboardId'],
      additionalProperties: false
    },
    name: 'get_dashboard',
    scope: 'dashboards:read'
  },
  {
    description: 'Create a dashboard using the web app runtime store. Text elements support plain-text insight config.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        description: { type: 'string' },
        elements: { type: 'array', description: 'Native dashboard elements. Use type text with config.text, textVariant, tone, badge, and showIcon for editable insights.', items: { type: 'object' } },
        filters: { type: 'array', items: { type: 'object' } },
        name: { type: 'string' },
        publish: { type: 'boolean' },
        settings: { type: 'object', description: 'Dashboard behavior settings such as currencySymbol and dataCachePolicy.' }
      },
      required: ['name'],
      additionalProperties: false
    },
    name: 'create_dashboard',
    scope: 'dashboards:write'
  },
  {
    description: 'Create or update a complete native dashboard definition in one call, including editable text insights, components, filters, layout, and publish state.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        dashboardId: { type: 'string' },
        description: { type: 'string' },
        elements: { type: 'array', description: 'Native dashboard elements, including type text for editable insight or section content.', items: { type: 'object' } },
        filters: { type: 'array', items: { type: 'object' } },
        layout: { type: 'array', items: { type: 'object' } },
        matchByName: { type: 'boolean' },
        name: { type: 'string' },
        publish: { type: 'boolean' },
        settings: { type: 'object', description: 'Dashboard behavior settings such as currencySymbol and dataCachePolicy.' },
        status: { type: 'string', enum: ['draft', 'published'] }
      },
      required: ['name'],
      additionalProperties: false
    },
    name: 'save_dashboard_definition',
    scope: 'dashboards:write'
  },
  {
    description: 'Update an existing dashboard shell or full element/filter definition.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        dashboardId: { type: 'string' },
        description: { type: 'string' },
        elements: { type: 'array', description: 'Native dashboard elements, including editable text insight elements.', items: { type: 'object' } },
        filters: { type: 'array', items: { type: 'object' } },
        layout: { type: 'array', items: { type: 'object' } },
        name: { type: 'string' },
        publish: { type: 'boolean' },
        settings: { type: 'object', description: 'Dashboard behavior settings such as currencySymbol and dataCachePolicy.' },
        status: { type: 'string', enum: ['draft', 'published'] }
      },
      required: ['dashboardId'],
      additionalProperties: false
    },
    name: 'update_dashboard',
    scope: 'dashboards:write'
  },
  {
    description: 'Add a native dashboard component through the dashboard runtime store. KPI card config supports supportingField, supportingAggregation, supportingFormat, supportingPrecision, supportingLabel, and supportingTone. Text insights use structured plain-text config rather than HTML.',
    inputSchema: {
      type: 'object',
      properties: {
        chartType: { type: 'string' },
        config: { type: 'object' },
        dashboardId: { type: 'string' },
        dataSourceId: { type: 'string' },
        layout: { type: 'object' },
        name: { type: 'string' },
        order: { type: 'number' },
        type: { type: 'string' }
      },
      required: ['dashboardId', 'name'],
      additionalProperties: false
    },
    name: 'add_dashboard_element',
    scope: 'dashboards:write'
  },
  {
    description: 'Update one native dashboard component. KPI card config supports a native supporting metric through supportingField, supportingAggregation, supportingFormat, supportingPrecision, supportingLabel, and supportingTone.',
    inputSchema: {
      type: 'object',
      properties: {
        chartType: { type: ['string', 'null'] },
        config: { type: 'object' },
        dataSourceId: { type: ['string', 'null'] },
        elementId: { type: 'string' },
        isVisible: { type: 'boolean' },
        layout: { type: 'object' },
        name: { type: 'string' },
        order: { type: 'number' },
        type: { type: 'string' }
      },
      required: ['elementId'],
      additionalProperties: false
    },
    name: 'update_dashboard_element',
    scope: 'dashboards:write'
  },
  {
    description: 'Add an interactive dashboard filter to an existing dashboard through the dashboard runtime store.',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'object' },
        dashboardId: { type: 'string' },
        field: { type: 'string' },
        name: { type: 'string' },
        operator: { type: 'string' },
        order: { type: 'number' },
        type: { type: 'string' },
        value: {}
      },
      required: ['dashboardId', 'name', 'field'],
      additionalProperties: false
    },
    name: 'add_dashboard_filter',
    scope: 'dashboards:write'
  },
  {
    description: 'Update one dashboard filter through the dashboard runtime store.',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'object' },
        dashboardId: { type: 'string' },
        field: { type: 'string' },
        filterId: { type: 'string' },
        isActive: { type: 'boolean' },
        name: { type: 'string' },
        operator: { type: 'string' },
        order: { type: 'number' },
        type: { type: 'string' },
        value: {}
      },
      required: ['dashboardId', 'filterId'],
      additionalProperties: false
    },
    name: 'update_dashboard_filter',
    scope: 'dashboards:write'
  },
  {
    description: 'Publish an existing dashboard through the dashboard runtime store.',
    inputSchema: {
      type: 'object',
      properties: { dashboardId: { type: 'string' } },
      required: ['dashboardId'],
      additionalProperties: false
    },
    name: 'publish_dashboard',
    scope: 'dashboards:write'
  },
  {
    description: 'List data sources visible to the authenticated intraQ user.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', minimum: 1, maximum: 100 } },
      additionalProperties: false
    },
    name: 'list_data_sources',
    scope: 'data-sources:read'
  },
  {
    description: 'List AI model metadata readiness for visible data sources and tables.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', minimum: 1, maximum: 100 } },
      additionalProperties: false
    },
    name: 'list_ai_model_metadata',
    scope: 'data-sources:read'
  },
  {
    description: 'Read configured AI model metadata for one data source, optionally scoped to one table.',
    inputSchema: {
      type: 'object',
      properties: {
        dataSourceId: { type: 'string' },
        table: { type: 'string' }
      },
      required: ['dataSourceId'],
      additionalProperties: false
    },
    name: 'get_ai_model_metadata',
    scope: 'data-sources:read'
  },
  {
    description: 'Validate whether configured metadata is sufficient for Analyzer and Dashboard Builder use.',
    inputSchema: {
      type: 'object',
      properties: {
        dataSourceId: { type: 'string' },
        table: { type: 'string' }
      },
      required: ['dataSourceId'],
      additionalProperties: false
    },
    name: 'validate_ai_model_metadata',
    scope: 'data-sources:read'
  },
  {
    description: 'Test how a natural-language question maps to model fields and configured value aliases.',
    inputSchema: {
      type: 'object',
      properties: {
        dataSourceId: { type: 'string' },
        question: { type: 'string' },
        table: { type: 'string' }
      },
      required: ['dataSourceId', 'question'],
      additionalProperties: false
    },
    name: 'test_ai_model_question_mapping',
    scope: 'data-sources:read'
  },
  {
    description: 'Import JSON or CSV AI model metadata for an existing data model. This updates labels, aliases, roles, sample questions, and value aliases; it does not create columns.',
    inputSchema: {
      type: 'object',
      properties: {
        csv: { type: 'string' },
        dataSourceId: { type: 'string' },
        fields: { type: ['array', 'object'] },
        metadata: { type: 'object' },
        mode: { type: 'string', enum: ['merge', 'replace'] },
        table: { type: 'string' },
        tables: { type: 'object' }
      },
      required: ['dataSourceId'],
      additionalProperties: false
    },
    name: 'import_ai_model_metadata',
    scope: 'sql-models:write'
  },
  ...MCP_WORKFLOW_TOOL_DEFINITIONS,
  ...MCP_PRODUCT_API_TOOL_DEFINITIONS
];
