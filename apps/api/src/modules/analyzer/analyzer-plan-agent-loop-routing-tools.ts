import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import {
  buildAnalyzerConversationPlan,
  buildAnalyzerInstructionPlan
} from './analyzer-conversation.js';
import {
  clarificationPlanFromToolArgs,
  isAnalyzerActionPlanResponse
} from './analyzer-plan-build-component.js';
import {
  readString,
  readStringArray
} from './analyzer-plan-utils.js';
import type {
  AnalyzerPlanAgentLoopOptions,
  AnalyzerPlanToolState,
  AnalyzerTurnIntent
} from './analyzer-plan-agent-loop-types.js';
import {
  isUnsafeAnalyzerDataAccessInstruction,
  unsafeAnalyzerDataAccessClarification
} from './analyzer-plan-agent-loop-guardrails.js';
import {
  hasAnalyzerModelMatches,
  recoverableAnalyzerRouteMismatchResult,
  recoverableAnalyzerRouteRequiredResult,
  recoverableModelSearchRequiredResult
} from './analyzer-plan-agent-loop-recovery.js';
import { shouldCorrectDashboardConversationIntent } from './analyzer-dashboard-context.js';

export function routeAnalyzerIntentTool(
  options: AnalyzerPlanAgentLoopOptions,
  state: AnalyzerPlanToolState
): CodexAgentTool {
  return {
    terminal: isAnalyzerActionPlanResponse,
    definition: {
      type: 'function',
      name: 'route_analyzer_user_turn',
      description: 'Semantically classify the latest Analyzer user turn before any other Analyzer planning tool is used. This is not table or keyword routing.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          answer: {
            type: 'string',
            description: 'Friendly direct answer when the intent is conversation. Do not explain the route classification.'
          },
          intent: {
            type: 'string',
            enum: ['business_analysis', 'conversation', 'missing_context', 'standing_instruction'],
            description: 'Semantic user-turn intent. Use business_analysis for explicit metric, trend, ranking, date-range, operational, domain analysis, row list, invoice/receipt/order lookup, status lookup, payment/order-type lookup, or totals lookup questions. Use conversation for dashboard, widget, chart/table/KPI/report-building, API endpoint, workflow, export job, or automation creation requests because those are product actions, not Analyzer data answers.'
          },
          instruction: {
            type: 'string',
            description: 'Durable Analyzer rule or preference when the intent is standing_instruction.'
          },
          missingContextType: {
            type: 'string',
            enum: ['data_source', 'data_model', 'schema'],
            description: 'Missing context when the intent is missing_context.'
          },
          reason: {
            type: 'string',
            description: 'Short reason for the route decision.'
          },
          suggestedFollowUps: {
            type: 'array',
            description: 'Useful Analyzer questions or next steps grounded in the selected data source.',
            items: { type: 'string' }
          }
        },
        required: ['intent']
      }
    },
    run: args => {
      const intent = parseAnalyzerTurnIntent(readString(args.intent));
      if (intent === 'conversation' && shouldCorrectDashboardConversationIntent(options.body, options.request.question)) {
        state.routedIntent = 'business_analysis';
        return {
          success: true,
          intent: 'business_analysis',
          correctedIntent: 'conversation',
          nextStep: 'Call break_down_analyzer_request next because this dashboard turn asks for a business data answer.'
        };
      }
      state.routedIntent = intent;
      if (intent === 'conversation') {
        return buildAnalyzerConversationPlan(options.request, null, readStringArray(args.suggestedFollowUps));
      }
      if (intent === 'standing_instruction') {
        const instruction = readString(args.instruction);
        if (isUnsafeAnalyzerDataAccessInstruction(options.request.question) || isUnsafeAnalyzerDataAccessInstruction(instruction)) {
          return unsafeAnalyzerDataAccessClarification(options.request, readStringArray(args.suggestedFollowUps));
        }
        return buildAnalyzerInstructionPlan(options.request, instruction, readStringArray(args.suggestedFollowUps));
      }
      if (intent === 'missing_context') {
        if (hasAnalyzerModelMatches(options.request, options.accessPolicy)) {
          state.routedIntent = 'business_analysis';
          return {
            success: true,
            intent: 'business_analysis',
            correctedIntent: 'missing_context',
            nextStep: 'Call break_down_analyzer_request next because AI-ready data-model candidates are available for this business question.'
          };
        }
        return clarificationPlanFromToolArgs(options.request, {
          missingContextType: readString(args.missingContextType) || 'data_model',
          reason: readString(args.reason) || 'The Analyzer needs a selected data source or data model before planning safely.',
          suggestedFollowUps: readStringArray(args.suggestedFollowUps)
        });
      }
      if (isUnsafeAnalyzerDataAccessInstruction(options.request.question)) {
        return unsafeAnalyzerDataAccessClarification(options.request, readStringArray(args.suggestedFollowUps));
      }
      return {
        success: true,
        intent,
        nextStep: 'Call break_down_analyzer_request next to separate the ask from filters, lookup values, scope, dates, grouping, sorting, limit, and output grain.'
      };
    }
  };
}

export function conversationTool(options: AnalyzerPlanAgentLoopOptions): CodexAgentTool {
  return {
    terminal: isAnalyzerActionPlanResponse,
    definition: {
      type: 'function',
      name: 'answer_analyzer_conversation',
      description: 'Answer conversational Analyzer chat, greetings, casual acknowledgements, typo-only chat, and capability questions without creating a table action plan.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          answer: {
            type: 'string',
            description: 'Concise operator-facing answer.'
          },
          suggestedFollowUps: {
            type: 'array',
            description: 'Useful Analyzer questions grounded in the selected data source and data-model context.',
            items: { type: 'string' }
          }
        }
      }
    },
    run: args => {
      if (hasAnalyzerModelMatches(options.request, options.accessPolicy)) return recoverableModelSearchRequiredResult();
      return buildAnalyzerConversationPlan(
        options.request,
        readString(args.answer),
        readStringArray(args.suggestedFollowUps)
      );
    }
  };
}

export function instructionTool(
  options: AnalyzerPlanAgentLoopOptions,
  state: AnalyzerPlanToolState
): CodexAgentTool {
  return {
    terminal: isAnalyzerActionPlanResponse,
    definition: {
      type: 'function',
      name: 'record_analyzer_instruction',
      description: 'Acknowledge an explicit durable Analyzer rule or preference without creating a table action plan. Do not use for greetings, casual chat, or one-word acknowledgements.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          instruction: {
            type: 'string',
            description: 'The standing Analyzer instruction to apply in later business questions.'
          },
          suggestedFollowUps: {
            type: 'array',
            description: 'Concrete business questions the user can ask next.',
            items: { type: 'string' }
          }
        }
      }
    },
    run: args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'standing_instruction') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      const instruction = readString(args.instruction);
      if (isUnsafeAnalyzerDataAccessInstruction(options.request.question) || isUnsafeAnalyzerDataAccessInstruction(instruction)) {
        return unsafeAnalyzerDataAccessClarification(options.request, readStringArray(args.suggestedFollowUps));
      }
      return buildAnalyzerInstructionPlan(
        options.request,
        instruction,
        readStringArray(args.suggestedFollowUps)
      );
    }
  };
}

function parseAnalyzerTurnIntent(value: string | null): AnalyzerTurnIntent {
  if (
    value === 'business_analysis'
    || value === 'conversation'
    || value === 'missing_context'
    || value === 'standing_instruction'
  ) {
    return value;
  }
  return 'business_analysis';
}
