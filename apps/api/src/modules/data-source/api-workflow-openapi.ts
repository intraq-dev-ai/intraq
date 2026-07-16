import {
  tableDisplayName,
  tablePathSlug,
  type DataSourceRecord,
  type TableDefinition
} from './foundation-store.js';
import {
  apiWorkflowRequestSchema,
  apiWorkflowResponseSchema,
  clientCredentialsTokenResponseSchema,
  errorResponse,
  readApiWorkflowResponseContract,
  tableResponseSchema,
  tableRowSchema
} from './api-workflow-openapi-schemas.js';

export type ApiWorkflowAccess = 'private' | 'public';

interface ApiWorkflowOpenApiOptions {
  baseUrl?: string;
  includePrivate?: boolean;
  includePublic?: boolean;
}

export function apiWorkflowAccess(source: DataSourceRecord): ApiWorkflowAccess {
  const workflow = readRecord(source.settings.apiWorkflow ?? source.settings.apiAccess ?? source.settings.externalApi);
  const raw = readString(
    workflow.access
      ?? workflow.visibility
      ?? workflow.exposure
      ?? source.settings.apiVisibility
      ?? source.settings.externalApiVisibility
  );
  return raw?.toLowerCase() === 'public' ? 'public' : 'private';
}

export function isPublicApiWorkflowSource(source: DataSourceRecord): boolean {
  return source.type.toLowerCase() === 'api' && apiWorkflowAccess(source) === 'public';
}

export function buildApiWorkflowOpenApiDocument(
  source: DataSourceRecord,
  options: ApiWorkflowOpenApiOptions = {}
): Record<string, unknown> {
  const access = apiWorkflowAccess(source);
  const includePublic = access === 'public' && options.includePublic !== false;
  const includePrivate = access !== 'public' && options.includePrivate !== false;
  const tables = source.tables.filter(table => table.isSelected !== false);
  const paths: Record<string, unknown> = {};

  if (includePublic) {
    paths['/api/public/api-workflows/token'] = tokenEndpointOperation();
  }

  for (const table of tables) {
    const pathSlug = tablePathSlug(table);
    if (includePublic) {
      paths[publicTablePath(source.id, pathSlug)] = tableOperations(source, table, {
        access,
        security: [{ ApiWorkflowOAuth: [PUBLIC_API_WORKFLOW_SCOPE] }],
        summaryPrefix: 'Public',
        tag: 'Public API Workflow'
      });
    }
    if (includePrivate) {
      paths[privateTablePath(source.id, pathSlug)] = tableOperations(source, table, {
        access: 'private',
        security: [{ BearerAuth: [] }],
        summaryPrefix: 'Private dashboard',
        tag: 'Private Dashboard API'
      });
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: `${source.name} API workflow`,
      version: readString(source.settings.apiVersion) ?? '1.0.0',
      description: [
        readString(source.description) ?? readString(source.dictionary.description) ?? `${source.name} API workflow contract.`,
        '',
        includePublic
          ? 'This workflow is public. Endpoints use OAuth 2.0 client credentials to issue a short-lived bearer token.'
          : 'This workflow is private. Endpoints are for authenticated dashboards and internal product workflows.'
      ].join('\n')
    },
    ...(options.baseUrl ? { servers: [{ url: options.baseUrl }] } : {}),
    tags: [
      ...(includePublic ? [{ name: 'Public API Workflow', description: 'External client credential access for public API workflows.' }] : []),
      ...(includePrivate ? [{ name: 'Private Dashboard API', description: 'Internal dashboard and authenticated product access.' }] : [])
    ],
    paths,
    components: {
      securitySchemes: {
        ...(includePublic ? {
          ApiWorkflowOAuth: {
            type: 'oauth2',
            flows: {
              clientCredentials: {
                tokenUrl: '/api/public/api-workflows/token',
                scopes: {
                  [PUBLIC_API_WORKFLOW_SCOPE]: 'Read public API workflow endpoints.'
                }
              }
            }
          }
        } : {}),
        ...(includePrivate ? {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        } : {})
      },
      schemas: {
        ApiWorkflowRequest: apiWorkflowRequestSchema(),
        ApiWorkflowResponse: apiWorkflowResponseSchema(),
        ClientCredentialsTokenResponse: clientCredentialsTokenResponseSchema(),
        ErrorEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', const: false },
            error: { type: 'string' }
          },
          required: ['success', 'error']
        }
      }
    },
    'x-intraq': {
      dataSourceId: source.id,
      dataSourceType: source.type,
      access,
      tableCount: tables.length
    }
  };
}

const PUBLIC_API_WORKFLOW_SCOPE = 'api-workflows:read';

function tokenEndpointOperation(): Record<string, unknown> {
  return {
    post: {
      tags: ['Public API Workflow'],
      summary: 'Create public API workflow access token',
      description: 'OAuth 2.0 client-credentials token endpoint for public API workflow clients.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/x-www-form-urlencoded': {
            schema: {
              type: 'object',
              properties: {
                grant_type: { type: 'string', const: 'client_credentials' },
                client_id: { type: 'string' },
                client_secret: { type: 'string' },
                scope: { type: 'string', default: PUBLIC_API_WORKFLOW_SCOPE }
              },
              required: ['grant_type']
            }
          },
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                grant_type: { type: 'string', const: 'client_credentials' },
                client_id: { type: 'string' },
                client_secret: { type: 'string' },
                scope: { type: 'string', default: PUBLIC_API_WORKFLOW_SCOPE }
              }
            }
          }
        }
      },
      responses: {
        '200': {
          description: 'Bearer token issued.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ClientCredentialsTokenResponse' }
            }
          }
        },
        '400': errorResponse('Invalid token request.'),
        '401': errorResponse('Client authentication failed.'),
        '503': errorResponse('External API client credentials are not configured.')
      }
    }
  };
}

function tableOperations(
  source: DataSourceRecord,
  table: TableDefinition,
  options: {
    access: ApiWorkflowAccess;
    security: Array<Record<string, unknown[]>>;
    summaryPrefix: string;
    tag: string;
  }
): Record<string, unknown> {
  const displayName = tableDisplayName(table);
  const rowSchema = tableRowSchema(table.fields);
  const responseSchema = tableResponseSchema(table, rowSchema);
  const operation = {
    tags: [options.tag],
    summary: `${options.summaryPrefix} ${displayName}`,
    description: table.description || `${displayName} from ${source.name}.`,
    security: options.security,
    requestBody: {
      required: false,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiWorkflowRequest' }
        }
      }
    },
    responses: {
      '200': {
        description: 'Rows returned.',
        content: {
          'application/json': {
            schema: responseSchema
          }
        }
      },
      '400': errorResponse('Invalid request.'),
      '401': errorResponse('Authentication is required.'),
      '403': errorResponse('Access is denied.'),
      '404': errorResponse('Data source or table was not found.')
    },
    'x-intraq': {
      dataSourceId: source.id,
      tableId: table.id,
      tableName: table.name,
      endpointSlug: tablePathSlug(table),
      displayName,
      ...(readApiWorkflowResponseContract(table) ? { responseContract: readApiWorkflowResponseContract(table) } : {}),
      access: options.access
    }
  };
  return {
    get: {
      ...operation,
      parameters: [
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: 'Maximum rows to return. Equivalent to pageSize when page is used.',
          schema: { type: 'integer', minimum: 1, default: 100 }
        },
        {
          name: 'offset',
          in: 'query',
          required: false,
          description: 'Zero-based row offset for offset pagination.',
          schema: { type: 'integer', minimum: 0, default: 0 }
        },
        {
          name: 'page',
          in: 'query',
          required: false,
          description: 'One-based page number. Used with pageSize.',
          schema: { type: 'integer', minimum: 1 }
        },
        {
          name: 'pageSize',
          in: 'query',
          required: false,
          description: 'Rows per page when page is supplied.',
          schema: { type: 'integer', minimum: 1, default: 100 }
        },
        {
          name: 'skip',
          in: 'query',
          required: false,
          description: 'Kendo-compatible alias for offset.',
          schema: { type: 'integer', minimum: 0 }
        },
        {
          name: 'take',
          in: 'query',
          required: false,
          description: 'Kendo-compatible alias for limit/pageSize.',
          schema: { type: 'integer', minimum: 1 }
        },
        {
          name: 'selectFields',
          in: 'query',
          required: false,
          description: 'Comma-separated field list.',
          schema: { type: 'string' }
        }
      ]
    },
    post: operation
  };
}

function publicTablePath(dataSourceId: string, tableName: string): string {
  return `/api/public/data-sources/${encodePathSegment(dataSourceId)}/tables/${encodePathSegment(tableName)}/data`;
}

function privateTablePath(dataSourceId: string, tableName: string): string {
  return `/api/data-sources/${encodePathSegment(dataSourceId)}/tables/${encodePathSegment(tableName)}/data`;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
