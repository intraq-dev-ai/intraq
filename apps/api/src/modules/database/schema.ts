export interface ProductTable {
  model: string;
  table: string;
  area: string;
  idPolicy: 'uuidv7' | 'composite-relation';
}

export const BASE_PRODUCT_TABLES: ProductTable[] = [
  table('DataSource', 'data_sources', 'data-models'),
  table('DataSourceTable', 'data_source_tables', 'data-models'),
  table('AIAnalyzerConversation', 'ai_analyzer_conversations', 'analyzer'),
  table('AIAnalyzerMessage', 'ai_analyzer_messages', 'analyzer'),
  table('AIAnalyzerUnmappedConceptEvent', 'ai_analyzer_unmapped_concept_events', 'analyzer'),
  table('Dashboard', 'dashboards', 'dashboards'),
  table('DashboardCategory', 'dashboard_categories', 'dashboards'),
  table('DashboardFilter', 'dashboard_filters', 'dashboards'),
  table('DashboardElement', 'dashboard_elements', 'dashboards'),
  table('Pipeline', 'pipelines', 'pipelines'),
  table('PipelineNode', 'pipeline_nodes', 'pipelines'),
  table('PipelineConnection', 'pipeline_connections', 'pipelines'),
  table('PipelineRun', 'pipeline_runs', 'pipelines'),
  relationTable('UserPipelineRelation', '_UserPipelines', 'pipelines'),
  table('User', 'users', 'identity'),
  relationTable('UserDashboardRelation', '_UserDashboards', 'dashboards'),
  table('Tenant', 'tenants', 'identity'),
  table('RefreshToken', 'refresh_tokens', 'auth'),
  table('EmailVerification', 'email_verifications', 'auth'),
  table('PasswordReset', 'password_resets', 'auth'),
  table('Setting', 'settings', 'settings'),
  table('SystemSetting', 'system_settings', 'settings'),
  table('SmtpConfiguration', 'smtp_configurations', 'communications'),
  table('Notification', 'notifications', 'communications'),
  table('OutboundEmail', 'outbound_emails', 'communications'),
  table('AuditLog', 'audit_logs', 'audit'),
  table('SampleDataset', 'sample_datasets', 'sample-data'),
  table('SampleTable', 'sample_tables', 'sample-data'),
  table('SampleDataRow', 'sample_data_rows', 'sample-data'),
  table('PipelineConfiguration', 'pipeline_configurations', 'pipelines'),
  table('DashboardSubscription', 'dashboard_subscriptions', 'dashboard-email'),
  table('SubscriptionDelivery', 'subscription_deliveries', 'dashboard-email'),
  table('EmailTemplate', 'email_templates', 'dashboard-email'),
  table('DashboardVersion', 'dashboard_versions', 'dashboards'),
  table('McpAccessToken', 'mcp_access_tokens', 'mcp'),
  table('ActivityLog', 'activity_logs', 'audit')
];

export function databaseCoverage(): Record<string, unknown> {
  const areaCounts = new Map<string, number>();
  for (const item of BASE_PRODUCT_TABLES) areaCounts.set(item.area, (areaCounts.get(item.area) ?? 0) + 1);
  return {
    source: 'base-product-prisma-schema',
    tableCount: BASE_PRODUCT_TABLES.length,
    idPolicy: {
      records: 'uuidv7',
      implicitRelations: 'composite-relation'
    },
    areas: Object.fromEntries([...areaCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    tables: BASE_PRODUCT_TABLES
  };
}

function table(model: string, tableName: string, area: string): ProductTable {
  return { model, table: tableName, area, idPolicy: 'uuidv7' };
}

function relationTable(model: string, tableName: string, area: string): ProductTable {
  return { model, table: tableName, area, idPolicy: 'composite-relation' };
}
