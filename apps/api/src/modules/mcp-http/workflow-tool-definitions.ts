import type { IntraQPrismaClient } from '@intraq/db';
import type { DashboardRuntimeStore } from '../dashboard/foundation-store.js';
import type { McpAuthenticatedPrincipal, McpScope } from '../mcp-access/types.js';

export interface McpWorkflowToolDefinition {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
  scope: McpScope | readonly McpScope[];
}

export interface McpWorkflowToolContext {
  args: Record<string, unknown>;
  dashboardStore: DashboardRuntimeStore | null;
  principal: McpAuthenticatedPrincipal;
  prismaClient: IntraQPrismaClient | null;
}

export const MCP_WORKFLOW_TOOL_DEFINITIONS: McpWorkflowToolDefinition[] = [
  {
    description: 'Register a saved SQL data model through the custom-query data source runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        baseDataSourceId: { type: 'string' },
        columns: { type: 'array', items: { type: 'object' } },
        description: { type: 'string' },
        fields: { type: 'array', items: { type: 'object' } },
        name: { type: 'string' },
        parameters: { type: 'array', items: { type: 'object' } },
        query: { type: 'string' },
        sampleRows: { type: 'array', items: { type: 'object' } },
        settings: { type: 'object' }
      },
      required: ['baseDataSourceId', 'name', 'query'],
      additionalProperties: true
    },
    name: 'register_sql_data_model',
    scope: 'sql-models:write'
  },
  {
    description: 'Run Analyzer planning, validate the selected schema, fetch result rows, and return the grounded Analyzer answer.',
    inputSchema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        dataSourceId: { type: 'string' },
        dataSourceTableId: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 1000 },
        question: { type: 'string' },
        tableName: { type: 'string' }
      },
      required: ['dataSourceId', 'question'],
      additionalProperties: false
    },
    name: 'run_analyzer_data_check',
    scope: ['analyzer:run', 'data-results:read']
  }
];
