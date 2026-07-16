import type { IncomingMessage, ServerResponse } from 'node:http';
import { activeProductRoutes } from '@intraq/contracts';
import type { ApiConfig } from './config.js';
import { sendNotFound, sendOk } from './http.js';
import type { AdminIntegrationsFoundationRoutes } from './modules/admin-integrations/foundation-routes.js';
import type { AgentThreadRoutes } from './modules/agent-thread/routes.js';
import type { AiProviderSettingsRoutes } from './modules/ai-provider-settings/routes.js';
import type { AdminFoundationRoutes } from './modules/admin/foundation-routes.js';
import type { AnalyzerCompatRoutes } from './modules/analyzer/compat-routes.js';
import type { AnalyzerHistoryFoundationRoutes } from './modules/analyzer/history-foundation-routes.js';
import type { AuthStore } from './modules/auth-setup/auth-store.js';
import type { AuthSetupFoundationRoutes } from './modules/auth-setup/foundation-routes.js';
import type { DashboardFoundationRoutes } from './modules/dashboard/foundation-routes.js';
import type { DatabaseSchemaRoutes } from './modules/database/routes.js';
import type { DataSourceFoundationRoutes } from './modules/data-source/foundation-routes.js';
import type { IntegrationsJobsFoundationRoutes } from './modules/integrations-jobs/foundation-routes.js';
import type { McpAccessFoundationRoutes } from './modules/mcp-access/foundation-routes.js';
import type { McpHttpRoutes } from './modules/mcp-http/routes.js';
import type { OAuthCodexCompatibilityRoutes } from './modules/oauth-codex/routes.js';
import type { PipelineFoundationRoutes } from './modules/pipeline/foundation-routes.js';
import type { PlatformFoundationRoutes } from './modules/platform/foundation-routes.js';
import type { ProductFoundationRoutes } from './modules/product/foundation-routes.js';
import type { PublicAccessFoundationRoutes } from './modules/public-access/foundation-routes.js';
import type { SqlChartFoundationRoutes } from './modules/sql-chart/foundation-routes.js';
import type { ProductAgentRoutes } from './product-agent-routes.js';
import { attachOptionalApiRequestContext, authorizeApiRequest } from './security/request-security.js';

export interface ApiRouteContext {
  adminFoundationRoutes: AdminFoundationRoutes;
  adminIntegrationsFoundationRoutes: AdminIntegrationsFoundationRoutes;
  aiProviderSettingsRoutes: AiProviderSettingsRoutes;
  agentRoutes: ProductAgentRoutes;
  agentThreadRoutes: AgentThreadRoutes;
  analyzerCompatRoutes: AnalyzerCompatRoutes;
  analyzerHistoryFoundationRoutes: AnalyzerHistoryFoundationRoutes;
  authSetupFoundationRoutes: AuthSetupFoundationRoutes;
  authStore: AuthStore | null;
  config: ApiConfig;
  dashboardFoundationRoutes: DashboardFoundationRoutes;
  databaseSchemaRoutes: DatabaseSchemaRoutes;
  dataSourceFoundationRoutes: DataSourceFoundationRoutes;
  integrationsJobsFoundationRoutes: IntegrationsJobsFoundationRoutes;
  mcpAccessFoundationRoutes: McpAccessFoundationRoutes;
  mcpHttpRoutes: McpHttpRoutes;
  oauthCodexCompatibilityRoutes: OAuthCodexCompatibilityRoutes;
  pipelineFoundationRoutes: PipelineFoundationRoutes;
  platformFoundationRoutes: PlatformFoundationRoutes;
  productFoundationRoutes: ProductFoundationRoutes;
  publicAccessFoundationRoutes: PublicAccessFoundationRoutes;
  sqlChartFoundationRoutes: SqlChartFoundationRoutes;
}

export async function routeApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  routes: ApiRouteContext
): Promise<boolean> {
  if (await routes.mcpHttpRoutes.handle(req, res, url)) return true;

  if (!url.pathname.startsWith('/api') && !url.pathname.startsWith('/widget/')) return false;

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendOk(res, {
      status: 'ok',
      service: 'intraq-api',
      webOrigin: routes.config.webOrigin
    });
    return true;
  }

  if (
    routes.config.enforceApiAuth === true
    && !await authorizeApiRequest(req, res, url, routes.authStore, { acceptAuthCookie: routes.config.acceptAuthCookie === true })
  ) {
    return true;
  }
  if (routes.config.enforceApiAuth !== true) {
    await attachOptionalApiRequestContext(req, routes.authStore, { acceptAuthCookie: routes.config.acceptAuthCookie === true });
  }

  if (req.method === 'GET' && url.pathname === '/api/product/routes') {
    sendOk(res, { routes: activeProductRoutes });
    return true;
  }

  if (await handleProductAgentRoute(req, res, url, routes.agentRoutes, routes.analyzerCompatRoutes)) return true;
  if (await routes.analyzerHistoryFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.agentThreadRoutes.handle(req, res, url)) return true;
  if (await routes.authSetupFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.aiProviderSettingsRoutes.handle(req, res, url)) return true;
  if (await routes.adminFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.adminIntegrationsFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.dashboardFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.databaseSchemaRoutes.handle(req, res, url)) return true;
  if (await routes.dataSourceFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.integrationsJobsFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.mcpAccessFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.oauthCodexCompatibilityRoutes.handle(req, res, url)) return true;
  if (await routes.pipelineFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.platformFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.sqlChartFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.publicAccessFoundationRoutes.handle(req, res, url)) return true;
  if (await routes.productFoundationRoutes.handle(req, res, url)) return true;

  sendNotFound(res);
  return true;
}

async function handleProductAgentRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  agentRoutes: ProductAgentRoutes,
  analyzerCompatRoutes: AnalyzerCompatRoutes
): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/api/dashboard-builder/conversation') {
    await agentRoutes.handleRestoreBuilderConversation(res, url);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/dashboard-builder/conversation') {
    await agentRoutes.handleCreateBuilderConversation(req, res);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/dashboard-builder/conversation/reset-session') {
    await agentRoutes.handleResetBuilderConversation(req, res);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/ai/perform-action-v2') {
    await agentRoutes.handlePerformAction(req, res);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/ai/recommend-data-model-v2') {
    await agentRoutes.handleRecommendDataModel(req, res);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/analyzer/ask') {
    await agentRoutes.handleAnalyzerAsk(req, res);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/analyzer/ask/stream') {
    await agentRoutes.handleAnalyzerAskStream(req, res);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/ai-data-analyzer/orchestrate') {
    await analyzerCompatRoutes.handleOrchestrate(req, res);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/ai-data-analyzer/followup-resolve') {
    await analyzerCompatRoutes.handleFollowupResolve(req, res);
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/ai-data-analyzer/plan') {
    await analyzerCompatRoutes.handlePlan(req, res);
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/ai-data-analyzer/unmapped-concepts') {
    await analyzerCompatRoutes.handleUnmappedConcepts(req, res);
    return true;
  }
  return false;
}
