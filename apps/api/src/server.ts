import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createPrismaClient } from '@intraq/db';
import { loadApiConfig, type ApiConfig } from './config.js';
import { sendInternalServerError, sendNotFound } from './http.js';
import {
  createAdminIntegrationsFoundationRoutes,
  type AdminIntegrationsFoundationRoutes
} from './modules/admin-integrations/foundation-routes.js';
import { createEmailDeliveryService } from './modules/admin-integrations/email-service.js';
import { createAgentThreadRoutes, type AgentThreadRoutes } from './modules/agent-thread/routes.js';
import { createAdminFoundationRoutes } from './modules/admin/foundation-routes.js';
import { AnalyzerCompatRoutes } from './modules/analyzer/compat-routes.js';
import { AnalyzerHistoryFoundationRoutes } from './modules/analyzer/history-foundation-routes.js';
import { AnalyzerPrismaHistoryStore } from './modules/analyzer/prisma-history-store.js';
import { PrismaAuthStore, type AuthStore } from './modules/auth-setup/auth-store.js';
import { createAuthSetupFoundationRoutes, type AuthSetupFoundationRoutes } from './modules/auth-setup/foundation-routes.js';
import { createDashboardFoundationRoutes, type DashboardFoundationRoutes } from './modules/dashboard/foundation-routes.js';
import { DashboardFoundationStore } from './modules/dashboard/foundation-store.js';
import { DashboardPrismaStore } from './modules/dashboard/prisma-store.js';
import { BuilderPrismaConversationStore } from './modules/dashboard/builder-prisma-conversations.js';
import { createDatabaseSchemaRoutes, type DatabaseSchemaRoutes } from './modules/database/routes.js';
import {
  createCodexAgentRuntime,
  type CodexAgentRuntime
} from './modules/codex-agent/codex-agent-runtime.js';
import { createDataSourceFoundationRoutes, type DataSourceFoundationRoutes } from './modules/data-source/foundation-routes.js';
import {
  type EnsureDataSourcesLoaded,
  noopEnsureDataSourcesLoaded,
  PrismaDataSourceRuntimeSync
} from './modules/data-source/prisma-runtime-sync.js';
import {
  createIntegrationsJobsFoundationRoutes,
  type IntegrationsJobsFoundationRoutes
} from './modules/integrations-jobs/foundation-routes.js';
import {
  createMcpAccessFoundationRoutes,
  type McpAccessFoundationRoutes
} from './modules/mcp-access/foundation-routes.js';
import { PrismaMcpTokenRepository } from './modules/mcp-access/prisma-token-repository.js';
import { McpTokenService } from './modules/mcp-access/token-service.js';
import { createMcpHttpRoutes, type McpHttpRoutes } from './modules/mcp-http/routes.js';
import {
  createOAuthCodexCompatibilityRoutes,
  type OAuthCodexCompatibilityRoutes
} from './modules/oauth-codex/routes.js';
import { restoreCodexOAuthPayloadFromDb } from './modules/oauth-codex/codex-oauth-persistence.js';
import { createPipelineFoundationRoutes, type PipelineFoundationRoutes } from './modules/pipeline/foundation-routes.js';
import { createPlatformFoundationRoutes, type PlatformFoundationRoutes } from './modules/platform/foundation-routes.js';
import { createProductFoundationRoutes, type ProductFoundationRoutes } from './modules/product/foundation-routes.js';
import { createPublicAccessFoundationRoutes, type PublicAccessFoundationRoutes } from './modules/public-access/foundation-routes.js';
import { createSqlChartFoundationRoutes, type SqlChartFoundationRoutes } from './modules/sql-chart/foundation-routes.js';
import { ProductAgentRoutes } from './product-agent-routes.js';
import { routeApi } from './server-routing.js';
import { serveWebAsset } from './server-web-assets.js';

export function createApiServer(config: ApiConfig & {
  authStore?: AuthStore;
  codexAgentRuntime?: CodexAgentRuntime;
} = loadApiConfig()): Server {
  const prismaClient = config.dashboardPersistence === 'prisma' ? createPrismaClient() : null;
  if (prismaClient) {
    void restoreCodexOAuthPayloadFromDb(prismaClient).catch(error => {
      console.error('Codex OAuth DB restore failed', error);
    });
  }
  const dataSourceRuntimeSync = prismaClient ? new PrismaDataSourceRuntimeSync(prismaClient) : null;
  const codexAgentRuntime = config.codexAgentRuntime ?? createCodexAgentRuntime();
  const ensureDataSourcesLoaded: EnsureDataSourcesLoaded = dataSourceRuntimeSync
    ? options => dataSourceRuntimeSync.ensureLoaded(options)
    : noopEnsureDataSourcesLoaded;
  const analyzerHistoryStore = prismaClient ? new AnalyzerPrismaHistoryStore(prismaClient) : undefined;
  const agentRoutes = new ProductAgentRoutes(
    ensureDataSourcesLoaded,
    codexAgentRuntime,
    prismaClient ? new BuilderPrismaConversationStore(prismaClient) : undefined,
    analyzerHistoryStore,
    prismaClient
  );
  const authStore = config.authStore ?? (prismaClient ? new PrismaAuthStore(prismaClient) : null);
  const emailService = createEmailDeliveryService(prismaClient);
  const analyzerCompatRoutes = new AnalyzerCompatRoutes(analyzerHistoryStore, ensureDataSourcesLoaded, codexAgentRuntime, prismaClient);
  const agentThreadRoutes = createAgentThreadRoutes(undefined, codexAgentRuntime);
  const authSetupFoundationRoutes = createAuthSetupFoundationRoutes(authStore, {
    acceptAuthCookie: config.acceptAuthCookie === true
  });
  const adminFoundationRoutes = createAdminFoundationRoutes(prismaClient);
  const adminIntegrationsFoundationRoutes = createAdminIntegrationsFoundationRoutes(prismaClient, emailService);
  const mcpTokenService = prismaClient && authStore
    ? new McpTokenService(new PrismaMcpTokenRepository(prismaClient), authStore)
    : null;
  const mcpAccessFoundationRoutes: McpAccessFoundationRoutes = createMcpAccessFoundationRoutes(mcpTokenService);
  const analyzerHistoryFoundationRoutes = prismaClient
    ? new AnalyzerHistoryFoundationRoutes(analyzerHistoryStore, prismaClient, undefined, ensureDataSourcesLoaded)
    : new AnalyzerHistoryFoundationRoutes();
  const dashboardFoundationStore = new DashboardFoundationStore();
  const dashboardRuntimeStore = config.dashboardPersistence === 'prisma'
    ? new DashboardPrismaStore(prismaClient ?? createPrismaClient())
    : dashboardFoundationStore;
  const dashboardFoundationRoutes = createDashboardFoundationRoutes(
    dashboardRuntimeStore,
    prismaClient,
    codexAgentRuntime
  );
  const databaseSchemaRoutes = createDatabaseSchemaRoutes();
  const dataSourceFoundationRoutes = createDataSourceFoundationRoutes(prismaClient, ensureDataSourcesLoaded, codexAgentRuntime);
  const integrationsJobsFoundationRoutes = createIntegrationsJobsFoundationRoutes();
  const oauthCodexCompatibilityRoutes = createOAuthCodexCompatibilityRoutes(prismaClient);
  const pipelineFoundationRoutes = createPipelineFoundationRoutes(prismaClient);
  const platformFoundationRoutes = createPlatformFoundationRoutes(prismaClient, {
    enableRuntimeDiagnostics: config.enableRuntimeDiagnostics === true
  });
  const sqlChartFoundationRoutes = createSqlChartFoundationRoutes(prismaClient, ensureDataSourcesLoaded, codexAgentRuntime);
  const publicAccessFoundationRoutes = createPublicAccessFoundationRoutes(dashboardRuntimeStore, undefined, prismaClient, ensureDataSourcesLoaded);
  const productFoundationRoutes = createProductFoundationRoutes();
  const productAgentBridgeRoutes = {
    async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
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
  };
  const mcpHttpRoutes: McpHttpRoutes = createMcpHttpRoutes(
    mcpTokenService,
    prismaClient,
    dashboardRuntimeStore,
    ensureDataSourcesLoaded,
    [
      productAgentBridgeRoutes,
      analyzerHistoryFoundationRoutes,
      agentThreadRoutes,
      dashboardFoundationRoutes,
      databaseSchemaRoutes,
      dataSourceFoundationRoutes,
      oauthCodexCompatibilityRoutes,
      platformFoundationRoutes,
      sqlChartFoundationRoutes,
      publicAccessFoundationRoutes,
      productFoundationRoutes
    ]
  );

  const server = createServer((req, res) => {
    req.on('error', error => {
      if (!isClientAbortError(error)) console.error('Request stream error', error);
    });
    res.on('error', error => {
      if (!isClientAbortError(error)) console.error('Response stream error', error);
    });

    void (async () => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (
        await routeApi(
          req,
          res,
          url,
          {
            adminFoundationRoutes,
            adminIntegrationsFoundationRoutes,
            agentRoutes,
            agentThreadRoutes,
            analyzerCompatRoutes,
            analyzerHistoryFoundationRoutes,
            authSetupFoundationRoutes,
            authStore,
            config,
            dashboardFoundationRoutes,
            databaseSchemaRoutes,
            dataSourceFoundationRoutes,
            integrationsJobsFoundationRoutes,
            mcpAccessFoundationRoutes,
            mcpHttpRoutes,
            oauthCodexCompatibilityRoutes,
            pipelineFoundationRoutes,
            platformFoundationRoutes,
            productFoundationRoutes,
            publicAccessFoundationRoutes,
            sqlChartFoundationRoutes
          }
        )
      ) {
        return;
      }
      if (config.serveWebFromApi === false) {
        sendNotFound(res);
        return;
      }
      await serveWebAsset(req, res, url, config.staticWebDir, platformFoundationRoutes, publicAccessFoundationRoutes);
    })().catch(error => {
      handleUnhandledRequestError(error, req, res);
    });
  });

  server.on('clientError', (error, socket) => {
    if (isClientAbortError(error)) {
      socket.destroy();
      return;
    }

    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    socket.destroy();
  });

  return server;
}

function handleUnhandledRequestError(error: unknown, req: IncomingMessage, res: ServerResponse): void {
  if (isClientAbortError(error) || req.destroyed || res.destroyed || res.writableEnded) return;

  console.error('Unhandled API request error', error);
  if (res.headersSent) {
    res.destroy();
    return;
  }

  try {
    sendInternalServerError(res);
  } catch (sendError) {
    if (!isClientAbortError(sendError)) console.error('Failed to send API error response', sendError);
  }
}

function isClientAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ECONNRESET' || error.name === 'AbortError' || error.message.toLowerCase().includes('aborted');
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryPoint) {
  const config = loadApiConfig();
  createApiServer(config).listen(config.port, config.host, () => {
    console.log(`intraQ API listening on http://${config.host}:${config.port}`);
  });
}
