import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import {
  buildMultiComponentPlan,
  clarificationPlanFromToolArgs,
  isAnalyzerActionPlanResponse
} from './analyzer-plan-build-component.js';
import { readString, readStringArray } from './analyzer-plan-utils.js';
import type {
  AnalyzerPlanAgentLoopOptions,
  AnalyzerPlanToolState
} from './analyzer-plan-agent-loop-types.js';
import {
  recoverableAnalyzerRouteMismatchResult,
  recoverableAnalyzerRouteRequiredResult,
  recoverableBuildComponentResult,
  recoverableModelSearchRequiredResult,
  recoverableNoEligibleCapabilitiesResult,
  recoverableSchemaSelectionRequiredResult,
  recoverableTrustedDirectSchemaCandidateRequiredResult,
  noEligibleCapabilitiesClarificationPlan
} from './analyzer-plan-agent-loop-recovery.js';
import {
  schemaArgsMatchTrustedDirectCandidate,
  trustedDirectSchemaIsLoaded
} from './analyzer-plan-agent-loop-schema-state.js';
import { preflightVerifiedMultiComponentBuildArgs } from './analyzer-plan-agent-loop-multi-build.js';

const actionStepSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string' },
    params: {
      type: 'object',
      additionalProperties: true
    }
  },
  required: ['action', 'params']
};

const capabilityFilterSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    field: {
      type: 'string',
      description: 'Exact field name from get_schema.capabilityContract.filterOperators.'
    },
    operator: {
      type: 'string',
      description: 'Exact supported operator from get_schema.capabilityContract.filterOperators[field], such as equals, in, gt, gte, lte, between, contains, or is_not_null.'
    },
    value: {
      description: 'Filter value. For between, use a two-value array. For in/not_in, use an array.',
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'array', items: {} },
        { type: 'null' }
      ]
    }
  },
  required: ['field', 'operator']
};

const capabilityInvocationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bucket: {
      type: 'object',
      additionalProperties: false,
      properties: {
        field: {
          type: 'string',
          description: 'Exact numeric field from get_schema.capabilityContract.bucketable.'
        },
        size: {
          type: 'number',
          description: 'Bucket size, for example 100 for invoice amount buckets of 100.'
        }
      },
      required: ['field', 'size']
    },
    filters: {
      type: 'array',
      description: 'Filters requested by the user or needed by resolved date/scope logic, using exact capabilityContract field names and supported operators.',
      items: capabilityFilterSchema
    },
    groupBy: {
      type: 'array',
      description: 'Exact field names from get_schema.capabilityContract.groupable.',
      items: { type: 'string' }
    },
    limit: {
      type: 'number',
      description: 'Requested row or top-N limit when relevant.'
    },
    measure: {
      type: 'string',
      description: 'Primary exact field name from get_schema.capabilityContract.measures when operation needs a metric.'
    },
    measures: {
      type: 'array',
      description: 'All exact measure field names needed in the answer. Include measure here when the question requests several totals or comparison operands.',
      items: { type: 'string' }
    },
    operation: {
      type: 'string',
      enum: ['list', 'aggregate', 'top_n', 'trend', 'compare', 'bucket'],
      description: 'The selected operation from get_schema.capabilityContract.operations.'
    },
    orderBy: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          direction: { type: 'string', enum: ['asc', 'desc'] },
          field: { type: 'string' }
        },
        required: ['field']
      }
    }
  },
  required: ['operation']
};

export function buildComponentTool(options: AnalyzerPlanAgentLoopOptions, state: AnalyzerPlanToolState): CodexAgentTool {
  return {
    terminal: isAnalyzerActionPlanResponse,
    definition: {
      type: 'function',
      name: 'build_component',
      description: 'Return a legacy Dashboard Builder action plan for the selected Analyzer model. Do not use for greetings, casual acknowledgements, typo-only chat, or capability questions.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          actions: {
            type: 'array',
            description: 'Dashboard Builder action steps such as create_table, set_table_sort, add_calculated_field, configure_static_filter, set_x_field, set_series_aggregation, and set_top_n. Keep create_table columns focused on the answer; do not include raw export columns or identifier/join keys unless requested. For saved SQL model parameters from get_schema, put resolved values in create_table.params.parameterValues.',
            items: actionStepSchema
          },
          capability: {
            ...capabilityInvocationSchema,
            description: 'Required Analyzer capability invocation proving this plan stays inside get_schema.capabilityContract. Use measures for every requested comparison total or output metric.'
          },
          componentType: {
            type: 'string',
            enum: ['chart', 'table', 'card', 'pie', 'matrix', 'filter'],
            description: 'Dashboard component type. Analyzer execution currently expects table for create_table plans.'
          },
          insightGuidance: {
            type: 'array',
            description: 'Concrete follow-up or interpretation guidance for the final Analyzer answer.',
            items: { type: 'string' }
          },
          knowledgeReferenceIds: {
            type: 'array',
            description: 'Knowledge reference ids from availableKnowledgeReferences that support the plan.',
            items: { type: 'string' }
          },
          message: {
            type: 'string',
            description: 'Short operator-facing explanation of what the component will show.'
          },
          mode: {
            type: 'string',
            enum: ['create', 'update'],
            description: 'Use create for Analyzer result plans.'
          },
          tableId: {
            type: 'string',
            description: 'Exact model id from get_schema.'
          },
          tableName: {
            type: 'string',
            description: 'Exact model name from get_schema.'
          },
          title: {
            type: 'string',
            description: 'Concise business title for the Analyzer result, generated from the request rather than echoing it. Use title case and 2-6 words, for example "Last Week Sales".'
          }
        },
        required: ['actions', 'capability', 'componentType', 'message', 'mode', 'title']
      }
    },
    run: args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'business_analysis') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      if (state.capabilityPreflightHadNoEligibleModels) {
        return noEligibleCapabilitiesClarificationPlan(options.request);
      }
      if (state.trustedDirectCandidate) {
        if (!trustedDirectSchemaIsLoaded(state)) {
          return recoverableTrustedDirectSchemaCandidateRequiredResult(state.trustedDirectCandidate);
        }
        const tableId = readString(args.tableId);
        const tableName = readString(args.tableName);
        if (
          state.preflightModelIds?.length
          && (tableId || tableName)
          && !preflightAllowsBuildModel(state.preflightModelIds, state.preflightModelNames ?? [], tableId, tableName)
        ) {
          return {
            success: false,
            error: 'Selected model was not returned by resolve_model_capabilities for this operation and filter set.',
            nextStep: 'Build the component from one of resolve_model_capabilities.eligibleModels.'
          };
        }
        if (
          (tableId || tableName)
          && !schemaArgsMatchTrustedDirectCandidate(tableId, tableName, state.trustedDirectCandidate)
        ) {
          return recoverableTrustedDirectSchemaCandidateRequiredResult(state.trustedDirectCandidate);
        }
      }
      if (!state.trustedDirectCandidate && state.preflightModelIds?.length) {
        const tableId = readString(args.tableId);
        const tableName = readString(args.tableName);
        if (
          (tableId || tableName)
          && !preflightAllowsBuildModel(state.preflightModelIds, state.preflightModelNames ?? [], tableId, tableName)
        ) {
          return {
            success: false,
            error: 'Selected model was not returned by resolve_model_capabilities for this operation and filter set.',
            nextStep: 'Build the component from one of resolve_model_capabilities.eligibleModels.'
          };
        }
      }
      if (!state.loadedSchema) {
        return recoverableSchemaSelectionRequiredResult(state);
      }
      return recoverableBuildComponentResult(
        options.request,
        args,
        state,
        options.capabilityGapIdentity
      );
    }
  };
}

function preflightAllowsBuildModel(
  modelIds: string[],
  modelNames: string[],
  tableId: string | null,
  tableName: string | null
): boolean {
  return Boolean(
    tableId && modelIds.includes(tableId)
    || tableName && modelNames.includes(tableName)
  );
}

export function buildMultiComponentTool(options: AnalyzerPlanAgentLoopOptions, state: AnalyzerPlanToolState): CodexAgentTool {
  return {
    terminal: isAnalyzerActionPlanResponse,
    definition: {
      type: 'function',
      name: 'build_multi_component',
      description: 'Return one Analyzer answer plan with multiple data-model result blocks when the business question needs summary/detail/audit evidence from more than one data model.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          insightGuidance: {
            type: 'array',
            description: 'Concrete interpretation guidance for the final combined Analyzer answer.',
            items: { type: 'string' }
          },
          message: {
            type: 'string',
            description: 'Short operator-facing explanation of why multiple data models are being used.'
          },
          results: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            description: 'Focused result plans. Each result must target one exact model id or name already inspected with get_schema.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                actions: {
                  type: 'array',
                  description: 'Dashboard Builder action steps for this model, including a create_table action with columns from that model schema.',
                  items: actionStepSchema
                },
                capability: {
                  ...capabilityInvocationSchema,
                  description: 'Required Analyzer capability invocation proving this result stays inside the selected get_schema.capabilityContract.'
                },
                componentType: {
                  type: 'string',
                  enum: ['chart', 'table', 'card', 'pie', 'matrix', 'filter'],
                  description: 'Use table for Analyzer result execution.'
                },
                insightGuidance: {
                  type: 'array',
                  description: 'Result-specific interpretation guidance.',
                  items: { type: 'string' }
                },
                knowledgeReferenceIds: {
                  type: 'array',
                  description: 'Knowledge reference ids from availableKnowledgeReferences that support this result.',
                  items: { type: 'string' }
                },
                message: {
                  type: 'string',
                  description: 'Short explanation of what this result contributes.'
                },
                mode: {
                  type: 'string',
                  enum: ['create', 'update'],
                  description: 'Use create for Analyzer result plans.'
                },
                tableId: {
                  type: 'string',
                  description: 'Exact model id from get_schema.'
                },
                tableName: {
                  type: 'string',
                  description: 'Exact model name from get_schema.'
                },
                title: {
                  type: 'string',
                  description: 'Concise business title for this result block.'
                }
              },
              required: ['actions', 'capability', 'componentType', 'message', 'mode', 'title']
            }
          }
        },
        required: ['message', 'results']
      }
    },
    run: args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'business_analysis') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      if (!state.loadedSchema) return recoverableSchemaSelectionRequiredResult(state);
      const buildArgs = preflightVerifiedMultiComponentBuildArgs(args, state, options.request.question);
      if (!buildArgs) return recoverableNoEligibleCapabilitiesResult();
      return buildMultiComponentPlan(options.request, buildArgs, options.capabilityGapIdentity);
    }
  };
}

export function clarificationTool(options: AnalyzerPlanAgentLoopOptions, state: AnalyzerPlanToolState): CodexAgentTool {
  return {
    terminal: isAnalyzerActionPlanResponse,
    definition: {
      type: 'function',
      name: 'request_data_source_or_model_context',
      description: 'Ask for missing selected data-source, data-model, or schema context when a concrete business analysis request cannot create a safe plan. Do not use when the input is simply not a business question; use answer_analyzer_conversation for that.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          missingContextType: {
            type: 'string',
            enum: ['data_source', 'data_model', 'schema'],
            description: 'The exact missing analysis context that prevents planning.'
          },
          reason: {
            type: 'string',
            description: 'Short reason naming the missing data source, data model, or schema context.'
          },
          suggestedFollowUps: {
            type: 'array',
            description: 'Concrete next steps for the user.',
            items: { type: 'string' }
          }
        },
        required: ['missingContextType', 'reason']
      }
    },
    run: args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'business_analysis' && state.routedIntent !== 'missing_context') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      if (!state.listedDataModels && !trustedDirectSchemaIsLoaded(state)) return recoverableModelSearchRequiredResult();
      if (state.matchedModelCount > 0 && !state.loadedSchema) return recoverableSchemaSelectionRequiredResult(state);
      const reason = readString(args.reason) || '';
      return clarificationPlanFromToolArgs(options.request, {
        missingContextType: readString(args.missingContextType) || 'data_model',
        reason: reason || 'The Analyzer needs more selected data-model context before planning safely.',
        suggestedFollowUps: readStringArray(args.suggestedFollowUps)
      });
    }
  };
}
