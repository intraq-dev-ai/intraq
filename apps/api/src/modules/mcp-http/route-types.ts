import type { McpScope } from '../mcp-access/types.js';

export type JsonRpcId = number | string | null;

export interface JsonRpcRequest {
  id?: JsonRpcId;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
}

export interface RpcResult {
  headers?: Record<string, string>;
  payload?: unknown;
  statusCode?: number;
}

export interface McpToolDefinition {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
  scope: McpScope | readonly McpScope[];
}
