import type { ApiEndpointRecord, ApiGroupRecord } from './api-group-types.js';
import { PUBLIC_API_WORKFLOW_SCOPE } from './foundation-public-api-auth.js';
import { readString } from './foundation-route-utils.js';

export function buildApiGroupOpenApiDocument(
  group: ApiGroupRecord,
  options: { baseUrl?: string; includePrivate?: boolean; includePublic?: boolean } = {}
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const includePublic = group.visibility === 'public' && options.includePublic !== false;
  const includePrivate = options.includePrivate !== false;
  if (includePublic) paths['/api/public/api-workflows/token'] = apiGroupTokenEndpointOperation();
  for (const endpoint of group.endpoints.filter(item => item.status !== 'archived')) {
    if (includePublic) {
      paths[`/api/v1/${group.slug}/${endpoint.slug}`] = apiGroupEndpointOperations(group, endpoint, {
        security: [{ ApiWorkflowOAuth: [PUBLIC_API_WORKFLOW_SCOPE] }],
        tag: group.name
      });
    }
    if (includePrivate) {
      paths[`/api/api-groups/${group.slug}/endpoints/${endpoint.slug}/data`] = apiGroupEndpointOperations(group, endpoint, {
        security: [{ BearerAuth: [] }],
        tag: `${group.name} Internal`
      });
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: `${group.name} API`,
      version: readString(group.settings.version) ?? '1.0.0',
      description: group.description ?? `${group.name} API group.`
    },
    ...(options.baseUrl ? { servers: [{ url: options.baseUrl }] } : {}),
    tags: [
      { name: group.name, description: group.description ?? `${group.name} endpoints.` },
      ...(includePrivate ? [{ name: `${group.name} Internal`, description: 'Authenticated dashboard and Analyzer access.' }] : [])
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
                scopes: { [PUBLIC_API_WORKFLOW_SCOPE]: 'Read public API workflow endpoints.' }
              }
            }
          }
        } : {}),
        ...(includePrivate ? {
          BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        } : {})
      },
      schemas: {
        ApiWorkflowRequest: {
          type: 'object',
          properties: {
            parameterValues: { type: 'object', additionalProperties: true },
            parameters: { type: 'object', additionalProperties: true },
            page: { type: 'integer', minimum: 1 },
            pageSize: { type: 'integer', minimum: 1 },
            selectFields: { type: 'array', items: { type: 'string' } }
          }
        },
        ApiWorkflowResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                rows: { type: 'array', items: { type: 'object', additionalProperties: true } },
                columns: { type: 'array', items: { type: 'string' } },
                totalRows: { type: 'integer' }
              }
            }
          }
        },
        ErrorEnvelope: {
          type: 'object',
          properties: { success: { type: 'boolean', const: false }, error: { type: 'string' } }
        }
      }
    },
    'x-intraq': {
      apiGroupId: group.id,
      slug: group.slug,
      visibility: group.visibility,
      endpointCount: group.endpoints.length
    }
  };
}

function apiGroupEndpointOperations(
  group: ApiGroupRecord,
  endpoint: ApiEndpointRecord,
  options: { security: Array<Record<string, unknown[]>>; tag: string }
): Record<string, unknown> {
  const operation = {
    tags: [options.tag],
    summary: endpoint.name,
    description: endpoint.description ?? `${endpoint.name} from ${group.name}.`,
    security: options.security,
    requestBody: {
      required: false,
      content: {
        'application/json': {
          schema: Object.keys(endpoint.requestSchema).length > 0
            ? endpoint.requestSchema
            : { $ref: '#/components/schemas/ApiWorkflowRequest' }
        }
      }
    },
    responses: {
      '200': {
        description: 'Rows returned.',
        content: {
          'application/json': {
            schema: Object.keys(endpoint.responseSchema).length > 0
              ? endpoint.responseSchema
              : { $ref: '#/components/schemas/ApiWorkflowResponse' }
          }
        }
      },
      '400': apiGroupErrorResponse('Invalid request.'),
      '401': apiGroupErrorResponse('Authentication is required.'),
      '403': apiGroupErrorResponse('Access is denied.'),
      '404': apiGroupErrorResponse('Endpoint was not found.')
    },
    'x-intraq': {
      apiGroupId: group.id,
      apiGroupSlug: group.slug,
      endpointId: endpoint.id,
      endpointSlug: endpoint.slug,
      executionType: endpoint.executionType,
      dataSourceId: endpoint.dataSourceId,
      dataSourceTableId: endpoint.dataSourceTableId,
      pipelineId: endpoint.pipelineId
    }
  };
  return {
    get: operation,
    post: operation
  };
}

function apiGroupTokenEndpointOperation(): Record<string, unknown> {
  return {
    post: {
      tags: ['Authentication'],
      summary: 'Create API group access token',
      security: [],
      responses: {
        '200': {
          description: 'Bearer token issued.'
        },
        '401': apiGroupErrorResponse('Client authentication failed.')
      }
    }
  };
}

function apiGroupErrorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorEnvelope' }
      }
    }
  };
}
