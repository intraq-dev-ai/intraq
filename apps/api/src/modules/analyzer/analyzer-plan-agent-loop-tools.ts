import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import type {
  AnalyzerPlanAgentLoopOptions,
  AnalyzerPlanToolState
} from './analyzer-plan-agent-loop-types.js';
import { trustedDirectSchemaCandidateFromContext } from './analyzer-plan-agent-loop-schema-state.js';
import {
  conversationTool,
  instructionTool,
  routeAnalyzerIntentTool
} from './analyzer-plan-agent-loop-routing-tools.js';
import {
  breakDownAnalyzerRequestTool
} from './analyzer-plan-agent-loop-request-tools.js';
import {
  getSchemaTool,
  listDataModelsTool,
  resolveFieldValuesTool
} from './analyzer-plan-agent-loop-model-tools.js';
import {
  resolveModelCapabilitiesTool
} from './analyzer-plan-agent-loop-capability-tools.js';
import {
  buildComponentTool,
  buildMultiComponentTool,
  clarificationTool
} from './analyzer-plan-agent-loop-build-tools.js';

export function createAnalyzerPlanToolState(context: Record<string, unknown>): AnalyzerPlanToolState {
  const trustedDirectCandidate = trustedDirectSchemaCandidateFromContext(context);
  return {
    listedDataModels: false,
    loadedSchema: false,
    matchedModelCount: 0,
    ...(trustedDirectCandidate ? { trustedDirectCandidate } : {})
  };
}

export function analyzerPlanTools(
  options: AnalyzerPlanAgentLoopOptions,
  context: Record<string, unknown>,
  state: AnalyzerPlanToolState = createAnalyzerPlanToolState(context)
): CodexAgentTool[] {
  const trustedDirectCandidate = state.trustedDirectCandidate;
  return [
    routeAnalyzerIntentTool(options, state),
    conversationTool(options),
    instructionTool(options, state),
    breakDownAnalyzerRequestTool(options, state),
    resolveModelCapabilitiesTool(options, state),
    ...(trustedDirectCandidate ? [] : [listDataModelsTool(options, state)]),
    getSchemaTool(options, state),
    resolveFieldValuesTool(options, state),
    buildComponentTool(options, state),
    buildMultiComponentTool(options, state),
    clarificationTool(options, state)
  ];
}
