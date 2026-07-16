import type { AnalyzerPlanRequest } from '../../validation.js';
import type {
  CodexAgentResult,
  CodexAgentRuntime
} from '../codex-agent/codex-agent-runtime.js';
import type { DataSourceAccessPolicy } from '../data-source/source-access.js';
import type { AnalyzerActionPlanResponse } from './analyzer-action-plan.js';
import type { ProductAnalyzerAgent } from './product-analyzer-agent.js';
import type { AnalyzerCapabilityGapIdentity } from './analyzer-unmapped-concept-log.js';

type AnalyzerPlanLoopAgent = Pick<ProductAnalyzerAgent, 'plan'>;

export interface AnalyzerPlanAgentLoopOptions {
  accessPolicy?: DataSourceAccessPolicy;
  analyzerAgent: AnalyzerPlanLoopAgent;
  body: unknown;
  capabilityGapIdentity?: AnalyzerCapabilityGapIdentity;
  codexAgent: CodexAgentRuntime;
  fallback: AnalyzerActionPlanResponse;
  model?: string;
  request: AnalyzerPlanRequest;
  tenantId?: string | null;
}

export interface AnalyzerPlanAgentLoopResult {
  agentProvider: CodexAgentResult;
  response: AnalyzerActionPlanResponse;
  toolTrace: AnalyzerPlanToolTraceEvent[];
}

export interface AnalyzerPlanToolTraceEvent {
  at: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  name?: string;
  ok?: boolean;
  status: 'completed' | 'failed' | 'started';
  summary?: string;
  terminal?: boolean;
  tool: string;
}

export interface AnalyzerPlanToolState {
  capabilityPreflightHadNoEligibleModels?: boolean;
  capabilityPreflightUsed?: boolean;
  requestBreakdown?: AnalyzerRequestBreakdown;
  routedIntent?: AnalyzerTurnIntent;
  listedDataModels: boolean;
  loadedSchema: boolean;
  matchedModelCount: number;
  firstMatchedModelId?: string;
  firstMatchedModelName?: string;
  preflightModelIds?: string[];
  preflightModelNames?: string[];
  preflightOperation?: AnalyzerCapabilityOperationName;
  preflightSupportedFiltersByModel?: Record<string, Array<Record<string, unknown>>>;
  preflightSupportedGroupByByModel?: Record<string, string[]>;
  preflightSupportedMeasuresByModel?: Record<string, string[]>;
  selectedTableId?: string;
  selectedTableName?: string;
  trustedDirectCandidate?: TrustedDirectSchemaCandidate;
}

export interface AnalyzerRequestBreakdown {
  filters: AnalyzerRequestBreakdownFilter[];
  groupBy: string[];
  limit?: number;
  measure?: string;
  measures?: string[];
  operation: AnalyzerCapabilityOperationName;
  query: string;
  sortBy?: string;
}

export interface AnalyzerRequestBreakdownFilter {
  field?: string;
  label?: string;
  operator?: string;
  searchText?: string;
  value?: unknown;
}

export type AnalyzerTurnIntent =
  | 'business_analysis'
  | 'conversation'
  | 'missing_context'
  | 'standing_instruction';

export interface TrustedDirectSchemaCandidate {
  businessName?: string;
  id?: string;
  matchedRoutingExample?: string;
  name?: string;
}

export type AnalyzerCapabilityOperationName =
  | 'list'
  | 'aggregate'
  | 'top_n'
  | 'trend'
  | 'compare'
  | 'bucket';
