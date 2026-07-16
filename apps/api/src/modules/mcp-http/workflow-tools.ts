import { createCustomQueryDataSource } from '../data-source/custom-query-routes.js';
import { dataSourceAccessPolicy } from '../data-source/source-access.js';
import { runAnalyzerDataCheck } from './analyzer-workflow.js';
import {
  MCP_WORKFLOW_TOOL_DEFINITIONS,
  type McpWorkflowToolContext,
  type McpWorkflowToolDefinition
} from './workflow-tool-definitions.js';

export { MCP_WORKFLOW_TOOL_DEFINITIONS, type McpWorkflowToolContext, type McpWorkflowToolDefinition } from './workflow-tool-definitions.js';

export function isMcpWorkflowTool(name: string): boolean {
  return MCP_WORKFLOW_TOOL_DEFINITIONS.some(tool => tool.name === name);
}

export async function executeMcpWorkflowTool(
  name: string,
  context: McpWorkflowToolContext
): Promise<unknown> {
  if (name === 'register_sql_data_model') return registerSqlDataModel(context);
  if (name === 'run_analyzer_data_check') return runAnalyzerDataCheck(context);
  throw new Error(`Unknown MCP workflow tool: ${name}`);
}

async function registerSqlDataModel(context: McpWorkflowToolContext): Promise<Record<string, unknown>> {
  const access = await dataSourceAccessPolicy(context.principal, context.prismaClient);
  const result = await createCustomQueryDataSource({
    access,
    body: context.args,
    prismaClient: context.prismaClient
  });
  if (!result.ok) throw new Error(result.error);
  return {
    id: result.source.id,
    name: result.source.name,
    type: result.source.type,
    sourceType: result.source.sourceType,
    baseDataSourceId: result.source.baseDataSourceId ?? null,
    tables: result.source.tables.map(table => ({
      id: table.id,
      name: table.name,
      description: table.description,
      isDataModel: table.settings?.isDataModel === true,
      fields: table.fields.map(field => ({ name: field.name, type: field.type }))
    }))
  };
}
