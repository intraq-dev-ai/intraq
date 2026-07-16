import type {
  ActionPlanMode,
  DashboardActionPlan,
  DashboardComponentType
} from './action-plan-contracts.js';
import type {
  VisualizationKind,
  VisualizationSpec
} from './dashboard-schema.js';

export type AgentWorkflowKind =
  | 'dashboard-builder'
  | 'analyzer'
  | 'data-expert'
  | 'external-data-analyst';

export interface KnowledgeReference {
  id: string;
  title: string;
  domain: string;
  summary: string;
  tags: string[];
}

export interface BuilderAgentRequest {
  prompt: string;
  conversationId?: string;
  conversationMessages?: BuilderConversationTurn[];
  fieldReferences?: BuilderFieldReference[];
  mode?: ActionPlanMode;
  componentType?: DashboardComponentType;
  visualizationKind?: VisualizationKind;
  dashboardId?: string;
  elementId?: string;
  dataSourceId?: string;
  dataSourceTableId?: string;
  tableName?: string;
  elementSnapshot?: Record<string, unknown>;
  dataModel?: AgentDataModel;
  textComponent?: BuilderTextComponentRequest;
}

export interface BuilderTextComponentRequest {
  badge?: string;
  content?: string;
  showIcon?: boolean;
  title?: string;
  tone?: 'critical' | 'info' | 'neutral' | 'success' | 'warning';
  variant?: 'body' | 'insight' | 'section';
}

export interface BuilderConversationTurn {
  content: string;
  role: 'assistant' | 'status' | 'user';
}

export interface BuilderFieldReference {
  exact?: boolean;
  field: string;
  label?: string;
  role?: string;
  token: string;
}

export interface BuilderAgentResult extends DashboardActionPlan {
  conversationId?: string;
  workflow: 'dashboard-builder';
  title: string;
  summary: string;
  visualizations: VisualizationSpec[];
  knowledgeReferences: KnowledgeReference[];
}

export interface BuilderAgentConversationResult {
  conversationId?: string;
  type: 'conversation';
  workflow: 'dashboard-builder';
  message: string;
  title: string;
  summary: string;
  suggestedActions: string[];
  knowledgeReferences: KnowledgeReference[];
}

export type BuilderAgentResponse = BuilderAgentResult | BuilderAgentConversationResult;

export interface AnalyzerRequest {
  question: string;
  conversationId?: string;
  dataSourceId?: string;
  dashboardId?: string;
}

export interface AnalyzerResult {
  workflow: 'analyzer';
  answer: string;
  suggestedFollowUps: string[];
  knowledgeReferences: KnowledgeReference[];
}

export interface DataModelRecommendationRequest {
  prompt: string;
  dataSourceId?: string;
  dataModels?: AgentDataModel[];
}

export interface DataModelRecommendation {
  subjectArea: string;
  dimensions: string[];
  measures: string[];
  filters: string[];
  knowledgeReferences: KnowledgeReference[];
}

export interface AgentDataField {
  name: string;
  type: string;
  aliases?: string[];
  columnType?: string;
  description?: string;
  dictionaryDescription?: string;
  format?: string;
  label?: string;
  role?: string;
  sampleValues?: unknown[];
  semanticRole?: string;
  synonyms?: string[];
}

export interface AgentDataModel {
  id: string;
  name: string;
  businessName?: string;
  description?: string;
  dictionary?: Record<string, unknown>;
  fields: AgentDataField[];
}
