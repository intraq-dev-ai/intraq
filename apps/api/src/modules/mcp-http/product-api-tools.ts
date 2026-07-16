import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { setRequestSecurityContext } from '../../security/request-context.js';
import type { McpAuthenticatedPrincipal, McpScope } from '../mcp-access/types.js';

type ProductApiAccess = 'read' | 'write';
type ProductApiMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export interface ProductApiRouteHandler {
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
}

export interface McpProductApiToolDefinition {
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
  scope: McpScope;
}

export interface McpProductApiToolContext {
  args: Record<string, unknown>;
  principal: McpAuthenticatedPrincipal;
  routeHandlers: ProductApiRouteHandler[];
}

interface ProductApiCatalogEntry {
  access: ProductApiAccess;
  description: string;
  methods: ProductApiMethod[];
  path: string;
  pattern: RegExp;
}

const PRODUCT_API_CATALOG: ProductApiCatalogEntry[] = [
  read('GET', '/api/ready', /^\/api\/ready$/, 'Read API readiness.'),
  read('GET', '/api/dashboard-suggestions', /^\/api\/dashboard-suggestions$/, 'Read dashboard suggestion prompts.'),
  read('GET', '/api/dashboards...', /^\/api\/dashboards(?:\/.*)?$/, 'Read dashboards, elements, filters, versions, and menu entries.'),
  write(['POST', 'PUT', 'DELETE'], '/api/dashboards...', /^\/api\/dashboards(?:\/.*)?$/, 'Create, update, duplicate, delete, publish, and draft dashboards.'),
  read('GET', '/api/dashboard-categories...', /^\/api\/dashboard-categories(?:\/.*)?$/, 'Read dashboard categories.'),
  write(['POST', 'PUT', 'DELETE'], '/api/dashboard-categories...', /^\/api\/dashboard-categories(?:\/.*)?$/, 'Create, update, delete, and reorder dashboard categories.'),
  read('GET', '/api/dashboard-builder/conversation', /^\/api\/dashboard-builder\/conversation$/, 'Restore Dashboard Builder conversations.'),
  write('POST', '/api/dashboard-builder/conversation...', /^\/api\/dashboard-builder\/conversation(?:\/reset-session)?$/, 'Create and reset Dashboard Builder conversations.'),
  write('POST', '/api/ai/perform-action-v2', /^\/api\/ai\/perform-action-v2$/, 'Run Dashboard Builder AI actions through the product agent.'),
  read('POST', '/api/ai/recommend-data-model-v2', /^\/api\/ai\/recommend-data-model-v2$/, 'Recommend data models for dashboard creation.'),
  read('GET', '/api/data-sources...', /^\/api\/data-sources(?:\/.*)?$/, 'Read data sources, schemas, dictionaries, and table metadata.'),
  read('POST', '/api/data-sources/query-preview', /^\/api\/data-sources\/query-preview$/, 'Preview source queries through the data source API.'),
  read('POST', '/api/data-sources/test-connection', /^\/api\/data-sources\/test-connection$/, 'Run data source connection tests.'),
  read('POST', '/api/data-sources/:id/field-values', /^\/api\/data-sources\/[^/]+\/field-values$/, 'Read distinct field values for filters.'),
  read('POST', '/api/data-sources/:id/tables/:table/data', /^\/api\/data-sources\/[^/]+\/tables\/[^/]+\/data$/, 'Read protected table result rows.'),
  write(['POST', 'PUT', 'DELETE'], '/api/data-sources...', /^\/api\/data-sources(?:\/.*)?$/, 'Create, update, delete, and register data sources or SQL data models.'),
  read('GET', '/api/sql-query/schema/:id', /^\/api\/sql-query\/schema\/[^/]+$/, 'Read SQL query schema.'),
  read('POST', '/api/sql-query/execute', /^\/api\/sql-query\/execute$/, 'Execute read-only SQL through the guarded SQL query API.'),
  read('GET', '/api/sql-editor/data-sources|schema', /^\/api\/sql-editor(?:\/data-sources|\/schema\/[^/]+)$/, 'Read SQL editor source catalog and schema.'),
  read('POST', '/api/sql-editor/execute', /^\/api\/sql-editor\/execute$/, 'Execute read-only SQL through the SQL editor.'),
  read('POST', '/api/chart-data...', /^\/api\/chart-data(?:\/summary|\/validate)?$/, 'Validate and fetch dashboard visualization data.'),
  read('POST', '/api/chart-summary', /^\/api\/chart-summary$/, 'Summarize chart data.'),
  read('POST', '/api/ai-data-analyzer/orchestrate|followup-resolve|plan', /^\/api\/ai-data-analyzer\/(?:orchestrate|followup-resolve|plan)$/, 'Run Analyzer orchestration, follow-up resolution, and planning.'),
  read('GET', '/api/ai-data-analyzer/conversations...', /^\/api\/ai-data-analyzer\/conversations(?:\/[^/]+\/messages)?$/, 'Read Analyzer conversation history and messages.'),
  write('POST', '/api/ai-data-analyzer/conversations...', /^\/api\/ai-data-analyzer\/conversations(?:\/[^/]+\/(?:messages|session\/clear))?$/, 'Create Analyzer conversations, append messages, and clear sessions.'),
  write(['PATCH', 'DELETE'], '/api/ai-data-analyzer/conversations/:id', /^\/api\/ai-data-analyzer\/conversations\/[^/]+$/, 'Update or delete Analyzer conversations.'),
  read('POST', '/api/analyzer/ask', /^\/api\/analyzer\/ask$/, 'Ask Analyzer using an execution payload.')
];

export const MCP_PRODUCT_API_TOOL_DEFINITIONS: McpProductApiToolDefinition[] = [
  {
    description: 'List allowlisted product API routes available through MCP.',
    inputSchema: {
      type: 'object',
      properties: { access: { type: 'string', enum: ['read', 'write'] } },
      additionalProperties: false
    },
    name: 'list_product_api_routes',
    scope: 'product-api:read'
  },
  {
    description: 'Call an allowlisted read or validation product API route through the real product route handlers.',
    inputSchema: apiCallSchema(['GET', 'POST']),
    name: 'call_product_read_api',
    scope: 'product-api:read'
  },
  {
    description: 'Call an allowlisted product API mutation route through the real product route handlers.',
    inputSchema: apiCallSchema(['DELETE', 'PATCH', 'POST', 'PUT']),
    name: 'call_product_write_api',
    scope: 'product-api:write'
  }
];

export function isMcpProductApiTool(name: string): boolean {
  return MCP_PRODUCT_API_TOOL_DEFINITIONS.some(tool => tool.name === name);
}

export async function executeMcpProductApiTool(
  name: string,
  context: McpProductApiToolContext
): Promise<unknown> {
  if (name === 'list_product_api_routes') return listRoutes(context.args);
  if (name === 'call_product_read_api') return callProductApi('read', context);
  if (name === 'call_product_write_api') return callProductApi('write', context);
  throw new Error(`Unknown MCP product API tool: ${name}`);
}

function listRoutes(args: Record<string, unknown>): Record<string, unknown> {
  const access = isProductApiAccess(args.access) ? args.access : null;
  const routes = PRODUCT_API_CATALOG
    .filter(route => !access || route.access === access)
    .map(({ access: routeAccess, description, methods, path }) => ({ access: routeAccess, description, methods, path }));
  return { routes, total: routes.length };
}

async function callProductApi(
  access: ProductApiAccess,
  context: McpProductApiToolContext
): Promise<Record<string, unknown>> {
  if (context.routeHandlers.length === 0) throw new Error('Product API bridge is unavailable.');
  const method = readMethod(context.args.method, access);
  const pathname = readPath(context.args.path);
  const entry = PRODUCT_API_CATALOG.find(route =>
    route.access === access && route.methods.includes(method) && route.pattern.test(pathname)
  );
  if (!entry) throw new Error(`${method} ${pathname} is not allowlisted for MCP ${access} access.`);

  const url = new URL(pathname, 'http://mcp.local');
  for (const [key, value] of Object.entries(readRecord(context.args.query))) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const req = createProductRequest(method, url, context.args.body, context.principal);
  const res = new ProductApiCaptureResponse();
  for (const handler of context.routeHandlers) {
    if (await handler.handle(req, res.asServerResponse(), url)) {
      return responsePayload(method, url, entry, res);
    }
  }
  throw new Error(`${method} ${pathname} is allowlisted but was not handled by the product API.`);
}

function createProductRequest(
  method: ProductApiMethod,
  url: URL,
  body: unknown,
  principal: McpAuthenticatedPrincipal
): IncomingMessage {
  const chunks = body === undefined ? [] : [JSON.stringify(body)];
  const req = Readable.from(chunks) as IncomingMessage;
  req.method = method;
  req.url = `${url.pathname}${url.search}`;
  req.headers = {
    'content-type': 'application/json',
    host: url.host
  };
  setRequestSecurityContext(req, principal);
  return req;
}

function responsePayload(
  method: ProductApiMethod,
  url: URL,
  entry: ProductApiCatalogEntry,
  res: ProductApiCaptureResponse
): Record<string, unknown> {
  const text = res.bodyText();
  const parsed = parseJson(text);
  return {
    access: entry.access,
    body: parsed ?? text,
    headers: res.headers,
    method,
    path: `${url.pathname}${url.search}`,
    statusCode: res.statusCode
  };
}

class ProductApiCaptureResponse {
  readonly headers: Record<string, string> = {};
  statusCode = 200;
  private readonly chunks: Buffer[] = [];

  asServerResponse(): ServerResponse {
    return this as unknown as ServerResponse;
  }

  writeHead(statusCode: number, headers: Record<string, string | number | string[]> = {}): this {
    this.statusCode = statusCode;
    for (const [key, value] of Object.entries(headers)) this.setHeader(key, value);
    return this;
  }

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  write(chunk: string | Buffer): boolean {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }

  end(chunk?: string | Buffer): this {
    if (chunk !== undefined) this.write(chunk);
    return this;
  }

  bodyText(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

function apiCallSchema(methods: ProductApiMethod[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      body: {},
      method: { type: 'string', enum: methods },
      path: { type: 'string' },
      query: { type: 'object' }
    },
    required: ['path'],
    additionalProperties: false
  };
}

function read(
  methods: ProductApiMethod | ProductApiMethod[],
  path: string,
  pattern: RegExp,
  description: string
): ProductApiCatalogEntry {
  return { access: 'read', description, methods: Array.isArray(methods) ? methods : [methods], path, pattern };
}

function write(
  methods: ProductApiMethod | ProductApiMethod[],
  path: string,
  pattern: RegExp,
  description: string
): ProductApiCatalogEntry {
  return { access: 'write', description, methods: Array.isArray(methods) ? methods : [methods], path, pattern };
}

function readMethod(value: unknown, access: ProductApiAccess): ProductApiMethod {
  const fallback = access === 'read' ? 'GET' : 'POST';
  const method = typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : fallback;
  if (method === 'DELETE' || method === 'GET' || method === 'PATCH' || method === 'POST' || method === 'PUT') {
    return method;
  }
  throw new Error('method must be GET, POST, PUT, PATCH, or DELETE.');
}

function isProductApiAccess(value: unknown): value is ProductApiAccess {
  return value === 'read' || value === 'write';
}

function readPath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim().startsWith('/api/')) {
    throw new Error('path must be an /api path.');
  }
  const path = value.trim();
  if (path.startsWith('/api/mcp') || path.startsWith('/api/mcp-access')) {
    throw new Error('MCP management routes cannot be called through the product API bridge.');
  }
  return path.split('?')[0] ?? path;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJson(value: string): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
