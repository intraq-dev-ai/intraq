-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "is_globally_visible" BOOLEAN NOT NULL DEFAULT true,
    "tenant_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'source',
    "cache_enabled" BOOLEAN,
    "cache_ttl" INTEGER,
    "cache_settings" JSONB,
    "dictionary" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source_tables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data_source_id" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "sql_query" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "defaultFilters" JSONB,
    "additionalFilters" JSONB,
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "last_synced" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "dictionary" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "data_source_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_group_snapshots" (
    "id" TEXT NOT NULL,
    "api_group_id" TEXT NOT NULL,
    "snapshot_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "comment" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_group_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_endpoints" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "execution_type" TEXT NOT NULL DEFAULT 'data_model',
    "data_source_id" TEXT,
    "data_source_table_id" TEXT,
    "pipeline_id" TEXT,
    "parameters" JSONB NOT NULL DEFAULT '[]',
    "request_schema" JSONB NOT NULL DEFAULT '{}',
    "response_schema" JSONB NOT NULL DEFAULT '{}',
    "response_contract" JSONB NOT NULL DEFAULT '{}',
    "security" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_group_grants" (
    "id" TEXT NOT NULL,
    "api_group_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "permission" TEXT NOT NULL DEFAULT 'read',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_group_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_client_api_group_grants" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "api_group_id" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_client_api_group_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyzer_conversations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "data_source_id" TEXT,
    "title" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_message_at" TIMESTAMP(3),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_analyzer_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyzer_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyzer_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyzer_unmapped_concept_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "conversation_id" TEXT,
    "data_source_id" TEXT NOT NULL,
    "table_id" TEXT,
    "table_name" TEXT,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "unsupported_concepts" JSONB NOT NULL DEFAULT '[]',
    "invalid_fields" JSONB,
    "meaningful_tokens" JSONB,
    "coverage_ratio" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyzer_unmapped_concept_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dashboards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT,
    "tenant_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_version_id" TEXT,
    "draft_layout" JSONB,
    "draft_filters" JSONB,
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,
    "category_id" TEXT,

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "tenant_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_filters" (
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "config" JSONB,
    "type" TEXT NOT NULL DEFAULT 'interactive',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_elements" (
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "data_source_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "chart_type" TEXT,
    "layout" JSONB NOT NULL,
    "config" JSONB,
    "query" JSONB,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "schedule" TEXT,
    "databricks_job_id" TEXT,
    "tenant_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_nodes" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "position" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_connections" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "from_node_id" TEXT NOT NULL,
    "to_node_id" TEXT NOT NULL,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "logs" JSONB,
    "metrics" JSONB,
    "errors" JSONB,
    "parameters" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SINGLE_TENANT_VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "tenant_id" TEXT,
    "company_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "contact_email" TEXT NOT NULL,
    "contact_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tenant_type" TEXT NOT NULL DEFAULT 'single',
    "type" TEXT NOT NULL DEFAULT 'REGULAR',
    "max_users" INTEGER NOT NULL DEFAULT 10,
    "max_dashboards" INTEGER NOT NULL DEFAULT 10,
    "max_data_sources" INTEGER NOT NULL DEFAULT 5,
    "host_type" TEXT NOT NULL DEFAULT 'self-hosted',
    "settings" JSONB,
    "suspension_reason" TEXT,
    "suspended_at" TIMESTAMP(3),
    "cache_enabled" BOOLEAN,
    "cache_ttl" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "tenant_id" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtp_configurations" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "from_name" TEXT NOT NULL DEFAULT 'IntraQ Support',
    "from_email" TEXT NOT NULL,
    "reply_to_email" TEXT,
    "bcc_email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "test_status" TEXT,
    "test_error" TEXT,
    "last_tested" TIMESTAMP(3),
    "tenant_id" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'TENANT',
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smtp_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "target_type" TEXT NOT NULL,
    "user_id" TEXT,
    "tenant_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_emails" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT NOT NULL,
    "to" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "html_content" TEXT NOT NULL,
    "text_content" TEXT,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "reply_to_email" TEXT,
    "bcc_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error_message" TEXT,
    "attachment_meta" JSONB,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_emails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "user_id" TEXT,
    "tenant_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sector" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_tables" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataset_id" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_data_rows" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_data_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_configurations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "runtime" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "status" TEXT DEFAULT 'unknown',
    "last_tested" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_subscriptions" (
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "recipients" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "frequency" TEXT NOT NULL,
    "schedule_time" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "cron_expression" TEXT,
    "export_formats" JSONB NOT NULL DEFAULT '["pdf"]',
    "pdf_format" TEXT NOT NULL DEFAULT 'A4',
    "pdf_orientation" TEXT NOT NULL DEFAULT 'portrait',
    "include_filters" BOOLEAN NOT NULL DEFAULT true,
    "include_raw_data" BOOLEAN NOT NULL DEFAULT true,
    "separate_sheets" BOOLEAN NOT NULL DEFAULT true,
    "include_intraq_insights" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sent" TIMESTAMP(3),
    "next_scheduled" TIMESTAMP(3),
    "total_sent" INTEGER NOT NULL DEFAULT 0,
    "tenant_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_deliveries" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "pdf_path" TEXT,
    "pdf_size" INTEGER,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html_content" TEXT NOT NULL,
    "text_content" TEXT,
    "variables" JSONB NOT NULL,
    "tenant_id" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_versions" (
    "id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "comment" TEXT,
    "is_auto_save" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "dashboard_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_access_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "scopes_json" JSONB NOT NULL DEFAULT '[]',
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "session_id" TEXT,
    "ref_id" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserDashboards" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserDashboards_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_UserPipelines" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserPipelines_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_source_tables_data_source_id_name_key" ON "data_source_tables"("data_source_id", "name");

-- CreateIndex
CREATE INDEX "api_groups_tenant_id_idx" ON "api_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "api_groups_slug_idx" ON "api_groups"("slug");

-- CreateIndex
CREATE INDEX "api_groups_visibility_status_idx" ON "api_groups"("visibility", "status");

-- CreateIndex
CREATE UNIQUE INDEX "api_groups_tenant_id_slug_key" ON "api_groups"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "api_group_snapshots_api_group_id_idx" ON "api_group_snapshots"("api_group_id");

-- CreateIndex
CREATE INDEX "api_group_snapshots_created_at_idx" ON "api_group_snapshots"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_group_snapshots_api_group_id_snapshot_number_key" ON "api_group_snapshots"("api_group_id", "snapshot_number");

-- CreateIndex
CREATE INDEX "api_endpoints_group_id_idx" ON "api_endpoints"("group_id");

-- CreateIndex
CREATE INDEX "api_endpoints_data_source_id_idx" ON "api_endpoints"("data_source_id");

-- CreateIndex
CREATE INDEX "api_endpoints_data_source_table_id_idx" ON "api_endpoints"("data_source_table_id");

-- CreateIndex
CREATE INDEX "api_endpoints_pipeline_id_idx" ON "api_endpoints"("pipeline_id");

-- CreateIndex
CREATE INDEX "api_endpoints_status_idx" ON "api_endpoints"("status");

-- CreateIndex
CREATE UNIQUE INDEX "api_endpoints_group_id_slug_method_key" ON "api_endpoints"("group_id", "slug", "method");

-- CreateIndex
CREATE INDEX "api_group_grants_target_type_target_id_idx" ON "api_group_grants"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_group_grants_api_group_id_target_type_target_id_permiss_key" ON "api_group_grants"("api_group_id", "target_type", "target_id", "permission");

-- CreateIndex
CREATE INDEX "api_client_api_group_grants_client_id_idx" ON "api_client_api_group_grants"("client_id");

-- CreateIndex
CREATE INDEX "api_client_api_group_grants_api_group_id_idx" ON "api_client_api_group_grants"("api_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_client_api_group_grants_client_id_api_group_id_key" ON "api_client_api_group_grants"("client_id", "api_group_id");

-- CreateIndex
CREATE INDEX "ai_analyzer_conversations_tenant_id_user_id_data_source_id__idx" ON "ai_analyzer_conversations"("tenant_id", "user_id", "data_source_id", "last_message_at");

-- CreateIndex
CREATE INDEX "ai_analyzer_messages_conversation_id_created_at_idx" ON "ai_analyzer_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_analyzer_unmapped_concept_events_tenant_id_data_source_i_idx" ON "ai_analyzer_unmapped_concept_events"("tenant_id", "data_source_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_analyzer_unmapped_concept_events_data_source_id_table_na_idx" ON "ai_analyzer_unmapped_concept_events"("data_source_id", "table_name", "created_at");

CREATE UNIQUE INDEX "pipeline_connections_from_node_id_to_node_id_key" ON "pipeline_connections"("from_node_id", "to_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_key" ON "email_verifications"("token");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

CREATE UNIQUE INDEX "settings_key_tenant_id_key" ON "settings"("key", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "outbound_emails_tenant_id_idx" ON "outbound_emails"("tenant_id");

-- CreateIndex
CREATE INDEX "outbound_emails_user_id_idx" ON "outbound_emails"("user_id");

CREATE UNIQUE INDEX "sample_tables_dataset_id_name_key" ON "sample_tables"("dataset_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_configurations_tenant_id_key" ON "pipeline_configurations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_versions_dashboard_id_version_number_key" ON "dashboard_versions"("dashboard_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_access_tokens_token_hash_key" ON "mcp_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "mcp_access_tokens_user_id_idx" ON "mcp_access_tokens"("user_id");

-- CreateIndex
CREATE INDEX "mcp_access_tokens_token_prefix_idx" ON "mcp_access_tokens"("token_prefix");

-- CreateIndex
CREATE INDEX "mcp_access_tokens_revoked_at_idx" ON "mcp_access_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "activity_logs_tenant_id_idx" ON "activity_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "activity_logs_source_idx" ON "activity_logs"("source");

-- CreateIndex
CREATE INDEX "activity_logs_session_id_idx" ON "activity_logs"("session_id");

-- CreateIndex
CREATE INDEX "activity_logs_ref_id_idx" ON "activity_logs"("ref_id");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "_UserDashboards_B_index" ON "_UserDashboards"("B");

-- CreateIndex
CREATE INDEX "_UserPipelines_B_index" ON "_UserPipelines"("B");

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_source_tables" ADD CONSTRAINT "data_source_tables_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_group_snapshots" ADD CONSTRAINT "api_group_snapshots_api_group_id_fkey" FOREIGN KEY ("api_group_id") REFERENCES "api_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_endpoints" ADD CONSTRAINT "api_endpoints_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "api_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_group_grants" ADD CONSTRAINT "api_group_grants_api_group_id_fkey" FOREIGN KEY ("api_group_id") REFERENCES "api_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_client_api_group_grants" ADD CONSTRAINT "api_client_api_group_grants_api_group_id_fkey" FOREIGN KEY ("api_group_id") REFERENCES "api_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyzer_messages" ADD CONSTRAINT "ai_analyzer_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_analyzer_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "dashboard_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "dashboard_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_categories" ADD CONSTRAINT "dashboard_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_categories" ADD CONSTRAINT "dashboard_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_filters" ADD CONSTRAINT "dashboard_filters_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_elements" ADD CONSTRAINT "dashboard_elements_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_elements" ADD CONSTRAINT "dashboard_elements_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_nodes" ADD CONSTRAINT "pipeline_nodes_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_connections" ADD CONSTRAINT "pipeline_connections_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_connections" ADD CONSTRAINT "pipeline_connections_from_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "pipeline_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_connections" ADD CONSTRAINT "pipeline_connections_to_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "pipeline_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "settings" ADD CONSTRAINT "settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smtp_configurations" ADD CONSTRAINT "smtp_configurations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tables" ADD CONSTRAINT "sample_tables_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "sample_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_data_rows" ADD CONSTRAINT "sample_data_rows_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "data_source_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_configurations" ADD CONSTRAINT "pipeline_configurations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_subscriptions" ADD CONSTRAINT "dashboard_subscriptions_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_subscriptions" ADD CONSTRAINT "dashboard_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_subscriptions" ADD CONSTRAINT "dashboard_subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_deliveries" ADD CONSTRAINT "subscription_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "dashboard_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_versions" ADD CONSTRAINT "dashboard_versions_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_versions" ADD CONSTRAINT "dashboard_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_access_tokens" ADD CONSTRAINT "mcp_access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserDashboards" ADD CONSTRAINT "_UserDashboards_A_fkey" FOREIGN KEY ("A") REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserDashboards" ADD CONSTRAINT "_UserDashboards_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserPipelines" ADD CONSTRAINT "_UserPipelines_A_fkey" FOREIGN KEY ("A") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserPipelines" ADD CONSTRAINT "_UserPipelines_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
