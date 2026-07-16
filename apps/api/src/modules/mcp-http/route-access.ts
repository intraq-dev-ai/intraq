import type { Prisma } from '@intraq/db';
import { isInstanceOwnerRole } from '../data-source/source-access.js';
import type { McpAuthenticatedPrincipal, McpScope } from '../mcp-access/types.js';
import type { McpToolDefinition } from './route-types.js';

export function dataSourceWhere(principal: McpAuthenticatedPrincipal): Prisma.DataSourceWhereInput | undefined {
  if (isInstanceOwnerRole(principal.role)) return undefined;
  const conditions: Prisma.DataSourceWhereInput[] = [
    { isGlobal: true },
    { isSample: true, isGloballyVisible: true }
  ];
  if (principal.tenantId) conditions.push({ tenantId: principal.tenantId });
  return { OR: conditions };
}

export function systemStatus(principal: McpAuthenticatedPrincipal): Record<string, unknown> {
  return {
    service: 'intraq-api',
    status: 'ok',
    token: {
      name: principal.tokenName,
      prefix: principal.tokenPrefix,
      scopes: principal.scopes
    }
  };
}

export function hasToolScopes(principal: McpAuthenticatedPrincipal, tool: McpToolDefinition): boolean {
  return toolScopes(tool).every(scope => principal.scopes.includes(scope));
}

function toolScopes(tool: McpToolDefinition): McpScope[] {
  const scope = tool.scope;
  return typeof scope === 'string' ? [scope] : [...scope];
}
