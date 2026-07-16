import type { DashboardBuilderAgent } from '@intraq/agent-core';
import type {
  BuilderAgentRequest,
  BuilderAgentResponse
} from '@intraq/contracts';
import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import {
  conversationResult,
  isBuilderAgentResponse,
  isSelectedComponentUpdateRequest
} from './dashboard-builder-agent-results.js';
import {
  asNonEmptyString,
  asStringArray
} from './dashboard-builder-agent-values.js';
import {
  hasSelectedComponentUpdateSelection,
  selectedComponentStyleUpdateResult
} from './dashboard-builder-agent-update-actions.js';
import type { DashboardBuilderTurnIntent } from './dashboard-builder-turn-router.js';
import {
  hasCreateComponentSelection,
  recoverableDashboardActionIntentRequiredResult,
  recoverableDashboardRouteRequiredResult,
  requestWithToolSelections
} from './dashboard-builder-agent-tool-support.js';

export interface DashboardBuilderToolInput {
  blockedDataResponse?: BuilderAgentResponse;
  builderAgent: DashboardBuilderAgent;
  request: BuilderAgentRequest;
}

interface DashboardBuilderToolState {
  routedIntent?: DashboardBuilderTurnIntent;
}

export function dashboardBuilderTools(
  input: DashboardBuilderToolInput,
  routedIntent: DashboardBuilderTurnIntent
): CodexAgentTool[] {
  const state: DashboardBuilderToolState = { routedIntent };
  const tools: CodexAgentTool[] = [
    {
      terminal: isBuilderAgentResponse,
      definition: {
        type: 'function',
        name: 'answer_dashboard_builder',
        description: 'Answer conversational Dashboard Builder questions without creating or changing a component.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', description: 'Short title for the answer.' },
            summary: { type: 'string', description: 'Operator-facing answer text.' },
            suggestedActions: {
              type: 'array',
              description: 'Useful next Dashboard Builder prompts.',
              items: { type: 'string' }
            }
          },
          required: ['title', 'summary', 'suggestedActions']
        }
      },
      run: args => state.routedIntent === 'conversation'
        ? conversationResult(input.request, {
            title: asNonEmptyString(args.title) ?? 'Dashboard AI',
            summary: asNonEmptyString(args.summary) ?? 'How can I help with this dashboard?',
            suggestedActions: asStringArray(args.suggestedActions)
          })
        : recoverableDashboardRouteRequiredResult()
    },
    {
      terminal: isBuilderAgentResponse,
      definition: {
        type: 'function',
        name: 'update_dashboard_component_style',
        description: 'Update the selected dashboard component style, title, visualization type, or visual options without creating another component.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chartType: {
              type: 'string',
              description: 'New visualization type only when the user explicitly asks to change the selected component chart or visualization type. Do not infer this from words inside a component title.'
            },
            columns: {
              type: 'array',
              description: 'Columns to show when remapping a selected table component.',
              items: { type: 'string' }
            },
            color: {
              type: 'string',
              description: 'Resolved CSS color or hex color for the selected chart/series.'
            },
            calculatedFields: {
              type: 'array',
              description: 'Calculated fields to add or update on the selected component.',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  expression: { type: 'string' },
                  name: { type: 'string' }
                },
                required: ['name', 'expression']
              }
            },
            conditionalFormatting: {
              type: 'array',
              description: 'Conditional formatting rules to add to the selected table, matrix, card, or chart.',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  color: { type: 'string' },
                  field: { type: 'string' },
                  operator: { type: 'string' },
                  tone: { type: 'string' },
                  value: {
                    oneOf: [
                      { type: 'boolean' },
                      { type: 'number' },
                      { type: 'string' }
                    ]
                  }
                },
                required: ['field', 'operator', 'value']
              }
            },
            columnFields: {
              type: 'array',
              description: 'Column grouping fields when remapping a selected matrix component.',
              items: { type: 'string' }
            },
            dimension: {
              type: 'string',
              description: 'Selected component dimension field when the user asks to remap visual data.'
            },
            measures: {
              type: 'array',
              description: 'Selected component measure fields when the user asks to remap visual data.',
              items: { type: 'string' }
            },
            supportingMetric: {
              type: 'object',
              additionalProperties: false,
              description: 'Optional factual context shown below a selected KPI value. This is independent from period-over-period trend.',
              properties: {
                aggregation: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max', 'first', 'last'] },
                field: { type: 'string', description: 'Exact supporting measure field from the selected data model.' },
                format: { type: 'string', enum: ['number', 'percentage', 'currency'] },
                label: { type: 'string', description: 'Short context after the supporting value, such as "of portfolio balance".' },
                precision: { type: 'number' },
                tone: { type: 'string', enum: ['default', 'info', 'success', 'warning', 'danger'] }
              }
            },
            options: {
              type: 'object',
              additionalProperties: {
                oneOf: [
                  { type: 'boolean' },
                  { type: 'number' },
                  { type: 'string' }
                ]
              },
              description: 'Visual option key/value updates such as showLegend or showDataLabels.'
            },
            rowFields: {
              type: 'array',
              description: 'Row grouping fields when remapping a selected matrix component.',
              items: { type: 'string' }
            },
            seriesColors: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Field-to-color map for one or more chart series.'
            },
            summary: { type: 'string', description: 'Short operator-facing summary of the update.' },
            targetField: {
              type: 'string',
              description: 'Series/measure field that the color targets when known. Use exact @field references from context.fieldReferences when present.'
            },
            tableFormat: {
              type: 'string',
              description: 'Table display style such as report, compact, dense, comfortable, or plain.'
            },
            tableSort: {
              type: 'object',
              additionalProperties: false,
              description: 'Sort configuration for a selected table or matrix.',
              properties: {
                direction: { type: 'string', enum: ['asc', 'desc'] },
                field: { type: 'string' }
              },
              required: ['field']
            },
            showTotals: {
              type: 'boolean',
              description: 'Enable or disable totals/footer totals for selected tabular components.'
            },
            title: {
              type: 'string',
              description: 'New component title when the user asks to rename, retitle, or correct the previous title change for the selected component.'
            },
            text: {
              type: 'string',
              description: 'Replacement plain-text content for a selected text or insight component.'
            },
            textVariant: {
              type: 'string',
              enum: ['body', 'section', 'insight'],
              description: 'Controlled presentation variant for a selected text component.'
            },
            tone: {
              type: 'string',
              enum: ['neutral', 'info', 'success', 'warning', 'critical'],
              description: 'Operational severity tone for a selected text insight.'
            },
            badge: {
              type: 'string',
              description: 'Short optional status label for a selected text insight.'
            },
            showIcon: {
              type: 'boolean',
              description: 'Whether a selected text insight displays its status icon.'
            },
            valueField: {
              type: 'string',
              description: 'Selected component value field when remapping a KPI card, filter, chart, or matrix value. Use exact @field references from context.fieldReferences when present.'
            },
            valueFields: {
              type: 'array',
              description: 'Value fields when remapping a selected matrix component.',
              items: { type: 'string' }
            },
            xField: {
              type: 'string',
              description: 'Selected component x-axis or breakdown field when the user asks to remap visual data. Use exact @field references from context.fieldReferences when present.'
            },
            yFields: {
              type: 'array',
              description: 'Selected component y-axis or metric fields when the user asks to remap visual data.',
              items: { type: 'string' }
            }
          },
          required: ['summary']
        }
      },
      run: args => state.routedIntent === 'update_selected_component'
        ? hasSelectedComponentUpdateSelection(args)
          ? selectedComponentStyleUpdateResult(input.request, args)
          : recoverableDashboardActionIntentRequiredResult()
        : recoverableDashboardRouteRequiredResult()
    },
    {
      terminal: isBuilderAgentResponse,
      definition: {
        type: 'function',
        name: 'create_dashboard_component_plan',
        description: 'Create a new dashboard component plan only when the user is not editing a selected component.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            componentType: {
              type: 'string',
              enum: ['chart', 'table', 'card', 'pie', 'matrix', 'filter', 'text'],
              description: 'Optional component type selected from the user intent.'
            },
            mode: {
              type: 'string',
              enum: ['create', 'update'],
              description: 'Optional create/update mode selected from the user intent.'
            },
            tableName: {
              type: 'string',
              description: 'Optional selected table name from the model context.'
            },
            visualizationKind: {
              type: 'string',
              enum: ['bar', 'line', 'pie', 'table', 'card', 'matrix', 'filter', 'text'],
              description: 'Required when componentType is chart or when the user requested a specific visualization shape.'
            },
            text: {
              type: 'string',
              description: 'Plain-text body when creating a text insight or section heading.'
            },
            title: {
              type: 'string',
              description: 'Short title for a text insight or section heading.'
            },
            textVariant: {
              type: 'string',
              enum: ['body', 'section', 'insight'],
              description: 'Controlled text presentation. Use insight for a severity-led callout.'
            },
            tone: {
              type: 'string',
              enum: ['neutral', 'info', 'success', 'warning', 'critical'],
              description: 'Operational severity tone for a text insight.'
            },
            badge: {
              type: 'string',
              description: 'Short optional status label such as Watch or Action required.'
            },
            showIcon: {
              type: 'boolean',
              description: 'Whether a text insight displays its status icon.'
            }
          }
        }
      },
      run: args => {
        if (state.routedIntent !== 'create_component') return recoverableDashboardRouteRequiredResult();
        if (!hasCreateComponentSelection(input.request, args)) {
          return recoverableDashboardActionIntentRequiredResult();
        }
        if (isSelectedComponentUpdateRequest(input.request)) {
          return conversationResult(input.request, {
            title: 'Editing selected component',
            summary: 'I can only update the selected component while it is open for editing. Stop editing it before creating another component.',
            suggestedActions: [
              'Change the selected component title',
              'Change the selected component chart type',
              'Remap the selected component fields'
            ]
          });
        }
        const selectedRequest = requestWithToolSelections(input.request, args);
        if (
          input.blockedDataResponse
          && selectedRequest.componentType !== 'text'
          && selectedRequest.visualizationKind !== 'text'
        ) {
          return input.blockedDataResponse;
        }
        return input.builderAgent.planDashboardElement(selectedRequest);
      }
    },
    {
      terminal: isBuilderAgentResponse,
      definition: {
        type: 'function',
        name: 'request_model_context_or_clarification',
        description: 'Ask for selected data-model, metric, dimension, table, or component clarification when safe component creation is not possible.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', description: 'Short clarification title.' },
            summary: { type: 'string', description: 'What model context or clarification is needed.' },
            suggestedActions: {
              type: 'array',
              description: 'Concrete next steps for selecting or clarifying the dashboard context.',
              items: { type: 'string' }
            }
          }
        }
      },
      run: args => state.routedIntent === 'missing_context'
        ? conversationResult(input.request, {
            title: asNonEmptyString(args.title) ?? 'Dashboard Builder Needs Data Context',
            summary: asNonEmptyString(args.summary)
              ?? 'I need a selected data model, metric, dimension, or table context before creating that dashboard component.',
            suggestedActions: asStringArray(args.suggestedActions)
          })
        : recoverableDashboardRouteRequiredResult()
    }
  ];
  if (input.request.mode === 'update' && !input.request.elementId) {
    return tools.filter(tool =>
      tool.definition.name === 'answer_dashboard_builder'
      || tool.definition.name === 'request_model_context_or_clarification'
    );
  }
  return input.request.mode === 'update'
    ? tools.filter(tool =>
      tool.definition.name !== 'create_dashboard_component_plan'
      && tool.definition.name !== 'apply_dashboard_design_theme'
    )
    : tools;
}
