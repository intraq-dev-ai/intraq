export interface DataSourceSummary {
  id: string;
  name: string;
  settings?: {
    dashboard?: {
      isDefault?: boolean;
      visible?: boolean;
    };
  };
}

export interface AnalyzerConversation {
  id: string;
  title: string;
  dataSourceId: string | null;
  metadata?: Record<string, unknown>;
  isArchived?: boolean;
  updatedAt: string;
  createdAt: string;
  lastMessageAt?: string | null;
}

export interface AnalyzerMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyzerAnswer {
  answer: string;
  suggestedFollowUps: string[];
  knowledgeReferences: Array<{
    id: string;
    title: string;
    summary?: string;
  }>;
}

export interface AnalyzerPlan {
  message: string;
  actions: AnalyzerPlanAction[];
  intentDetails?: AnalyzerIntentDetails;
  toolTrace?: AnalyzerPlanToolTraceEvent[];
  validation?: unknown;
}

export interface AnalyzerPlanToolTraceEvent {
  at?: string;
  durationMs?: number;
  error?: string;
  status?: string;
  summary?: string;
  terminal?: boolean;
  tool?: string;
  [key: string]: unknown;
}

export interface AnalyzerPlanAction {
  action: 'create_table' | 'request_clarification' | string;
  params: {
    title?: string;
    _dataSourceId?: string;
    _tableName?: string;
    reason?: string;
    question?: string;
    dataSourceId?: string;
    [key: string]: unknown;
  };
}

export interface AnalyzerIntentDetails {
  question: string;
  knowledgeReferences: AnalyzerAnswer['knowledgeReferences'];
  selectedModel: AnalyzerSelectedModel | null;
  selectedModels?: AnalyzerSelectedModel[];
  sql: string;
  insightGuidance: string[];
}

export interface AnalyzerSelectedModel {
  id: string;
  name: string;
  businessName: string;
  domain: string;
  grain: string | null;
  primaryTimeField: string | null;
  dimensions: string[];
  metrics: string[];
}

export interface AnalyzerOrchestration {
  originalQuestion: string;
  coveredQuestions: string[];
  deferredQuestions: string[];
  followup?: AnalyzerFollowupResolution;
}

export interface AnalyzerFollowupHint {
  field?: string;
  source?: string;
  type?: string;
  values?: string[];
  [key: string]: unknown;
}

export interface AnalyzerFollowupResolution {
  questionForPlan: string;
  resolved: boolean;
  useConversationContext?: boolean;
  hints: AnalyzerFollowupHint[];
}

export interface AnalyzerTableData {
  rows: Array<Record<string, unknown>>;
  totalRows: number;
  columns: AnalyzerColumn[];
  integrity?: AnalyzerExecutionIntegrity;
  sql?: string;
  tableName?: string;
}

export interface AnalyzerExecutionIntegrity {
  algorithm: 'sha256';
  executionSql?: {
    fingerprint: string;
    provenance: 'loader-reported-sql';
  };
  modelHash?: string;
  queryHash: string;
  resultHash: string;
}

export interface AnalyzerExecutionContract {
  schemaVersion: 1;
  executionId: string;
  executedAt: string;
  evidenceLevel: 'query_executed' | 'server_attested';
  origin: {
    conversationId: string;
    runId: string;
  };
  request: Record<string, unknown>;
  requestFingerprint: string;
  resultFingerprint: string;
  integrity?: AnalyzerExecutionIntegrity;
}

export interface AnalyzerExecution {
  tableName: string;
  rowCount: number;
  message: string;
  columns?: AnalyzerColumn[];
  dataModelId?: string;
  dataModelName?: string;
  dataSourceId?: string;
  executionContract?: AnalyzerExecutionContract;
  fetchedRows?: number;
  rows?: Array<Record<string, unknown>>;
  sql?: string;
  title?: string;
  totalRows?: number;
  relatedExecutions?: AnalyzerExecution[];
}

export interface AnalyzerColumn {
  field: string;
  label: string;
  summarize?: string;
  type?: string;
}
