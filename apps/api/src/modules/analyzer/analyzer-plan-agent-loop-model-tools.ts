import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import {
  getSchemaForAnalyzer,
  listDataModelsForAnalyzer
} from './analyzer-plan-schema.js';
import {
  isRecord,
  readString
} from './analyzer-plan-utils.js';
import { resolveAnalyzerFieldValues } from './analyzer-value-resolver.js';
import {
  readParameterValues
} from './analyzer-plan-build-component-parameters.js';
import type {
  AnalyzerPlanAgentLoopOptions,
  AnalyzerPlanToolState
} from './analyzer-plan-agent-loop-types.js';
import {
  buildComponentArgsWithSelectedSchema,
  recoverableCapabilityPreflightRequiredResult,
  recoverableAnalyzerRouteMismatchResult,
  recoverableAnalyzerRouteRequiredResult,
  recoverableSchemaSelectionRequiredResult,
  recoverableTrustedDirectSchemaCandidateRequiredResult,
  noEligibleCapabilitiesClarificationPlan,
  rememberMatchedModels,
  requestBreakdownRequiresCapabilityPreflight
} from './analyzer-plan-agent-loop-recovery.js';
import {
  schemaArgsMatchTrustedDirectCandidate
} from './analyzer-plan-agent-loop-schema-state.js';

export function listDataModelsTool(options: AnalyzerPlanAgentLoopOptions, state: AnalyzerPlanToolState): CodexAgentTool {
  return {
    terminal: isTerminalActionPlan,
    definition: {
      type: 'function',
      name: 'list_data_models',
      description: 'Search/page selected data models using AI-ready routing metadata for concrete business analysis questions only. Do not call for greetings, casual acknowledgements, typo-only chat, or capability questions.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum models to return. Backend caps this to the safe page size.'
          },
          offset: {
            type: 'number',
            description: 'Page offset when more routing matches exist.'
          },
          query: {
            type: 'string',
            description: 'Business question or routing terms used to match ai.routing metadata.'
          }
        }
      }
    },
    run: args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'business_analysis') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      if (state.trustedDirectCandidate) {
        return recoverableTrustedDirectSchemaCandidateRequiredResult(state.trustedDirectCandidate);
      }
      if (!state.capabilityPreflightUsed && requestBreakdownRequiresCapabilityPreflight(state)) {
        return recoverableCapabilityPreflightRequiredResult();
      }
      if (state.capabilityPreflightHadNoEligibleModels) {
        return noEligibleCapabilitiesClarificationPlan(options.request);
      }
      state.listedDataModels = true;
      const result = listDataModelsForAnalyzer(
        options.request.dataSourceId,
        args,
        options.request.question,
        options.accessPolicy
      );
      rememberMatchedModels(state, result);
      return result;
    }
  };
}

export function getSchemaTool(options: AnalyzerPlanAgentLoopOptions, state: AnalyzerPlanToolState): CodexAgentTool {
  return {
    terminal: isTerminalActionPlan,
    definition: {
      type: 'function',
      name: 'get_schema',
      description: 'Return the legacy-compatible schema for one selected data model before build_component. Call for retrievalCandidates.directSchemaCandidate or for a model selected by list_data_models.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tableId: {
            type: 'string',
            description: 'Exact table/model id returned by retrievalCandidates.directSchemaCandidate or list_data_models.'
          },
          tableName: {
            type: 'string',
            description: 'Exact table/model name returned by retrievalCandidates.directSchemaCandidate or list_data_models.'
          }
        }
      }
    },
    run: args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'business_analysis') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      if (!state.capabilityPreflightUsed && requestBreakdownRequiresCapabilityPreflight(state)) {
        return recoverableCapabilityPreflightRequiredResult();
      }
      if (state.capabilityPreflightHadNoEligibleModels) {
        return noEligibleCapabilitiesClarificationPlan(options.request);
      }
      const tableId = readString(args.tableId);
      const tableName = readString(args.tableName);
      if (
        state.preflightModelIds?.length
        && !preflightAllowsSchema(state.preflightModelIds, state.preflightModelNames ?? [], tableId, tableName)
      ) {
        return {
          success: false,
          error: 'Selected model was not returned by resolve_model_capabilities for this operation and filter set.',
          nextStep: 'Call get_schema for one of resolve_model_capabilities.eligibleModels.'
        };
      }
      if (
        state.trustedDirectCandidate
        && !schemaArgsMatchTrustedDirectCandidate(tableId, tableName, state.trustedDirectCandidate)
      ) {
        return recoverableTrustedDirectSchemaCandidateRequiredResult(state.trustedDirectCandidate);
      }
      state.loadedSchema = true;
      if (tableId) state.selectedTableId = tableId;
      if (tableName) state.selectedTableName = tableName;
      return getSchemaForAnalyzer(options.request.dataSourceId, args, options.accessPolicy);
    }
  };
}

function isTerminalActionPlan(output: unknown): boolean {
  return isRecord(output) && output.success === true && Array.isArray(output.actions);
}

function preflightAllowsSchema(
  modelIds: string[],
  modelNames: string[],
  tableId: string | null,
  tableName: string | null
): boolean {
  if (!tableId && !tableName) return true;
  return Boolean(
    tableId && modelIds.includes(tableId)
    || tableName && modelNames.includes(tableName)
  );
}

export function resolveFieldValuesTool(options: AnalyzerPlanAgentLoopOptions, state: AnalyzerPlanToolState): CodexAgentTool {
  return {
    terminal: false,
    definition: {
      type: 'function',
      name: 'resolve_field_values',
      description: 'Resolve user-provided entity text to exact AI-ready data-model field values before filtering. Use after get_schema for lookup fields such as product, customer, invoice, staff, location, payment, order type, or other dynamic values.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: {
            type: 'string',
            description: 'Exact field name from get_schema whose value needs resolving.'
          },
          limit: {
            type: 'number',
            description: 'Maximum matching values to return. Backend caps this to the safe resolver limit.'
          },
          searchText: {
            type: 'string',
            description: 'The user-provided entity/value text to resolve, for example "maki roll".'
          },
          tableId: {
            type: 'string',
            description: 'Exact model id from get_schema.'
          },
          tableName: {
            type: 'string',
            description: 'Exact model name from get_schema.'
          }
        },
        required: ['field', 'searchText']
      }
    },
    run: async args => {
      if (!state.routedIntent) return recoverableAnalyzerRouteRequiredResult();
      if (state.routedIntent !== 'business_analysis') {
        return recoverableAnalyzerRouteMismatchResult(state.routedIntent);
      }
      if (!state.loadedSchema) return recoverableSchemaSelectionRequiredResult(state);
      const resolvedArgs = buildComponentArgsWithSelectedSchema(args, state);
      return resolveAnalyzerFieldValues(options.request.dataSourceId, resolvedArgs, {
        ...(options.accessPolicy ? { accessPolicy: options.accessPolicy } : {}),
        ...runtimeParameterValuesOption(options.body),
        question: options.request.question
      });
    }
  };
}

function runtimeParameterValuesOption(body: unknown): { parameterValues?: Record<string, unknown> } {
  if (!isRecord(body)) return {};
  const values = {
    ...readParameterValues(body.accessContext),
    ...readParameterValues(body.runtimeParameterValues),
    ...readParameterValues(body.parameterValues)
  };
  return Object.keys(values).length > 0 ? { parameterValues: values } : {};
}
