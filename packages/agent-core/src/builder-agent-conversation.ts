import type {
  BuilderAgentConversationResult,
  BuilderAgentRequest
} from '@intraq/contracts';

export function isDashboardBuilderConversationPrompt(prompt: string): boolean {
  return prompt.trim().length === 0;
}

export function buildDashboardBuilderConversationResult(
  request: BuilderAgentRequest
): BuilderAgentConversationResult {
  const modelName = request.dataModel?.businessName
    ?? readString(request.dataModel?.dictionary?.businessName)
    ?? request.tableName
    ?? request.dataModel?.name;
  const context = modelName
    ? `I am connected to #${modelName}.`
    : request.dataSourceId
      ? 'I am connected to the selected data source; choose a data model when you want me to create a component.'
      : 'Choose a data source when you want me to create a component.';
  return {
    type: 'conversation',
    workflow: 'dashboard-builder',
    message: request.prompt,
    title: 'Dashboard AI ready',
    summary: `Hi. ${context} Ask for a chart, KPI, table, matrix, filter, or business answer and I will use the selected model context before taking action.`,
    suggestedActions: suggestedActionsFor(request),
    knowledgeReferences: []
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function suggestedActionsFor(request: BuilderAgentRequest): string[] {
  const fields = request.dataModel?.fields ?? [];
  const measure = fields.find(field => field.type === 'number');
  const dimension = fields.find(field => field.type !== 'number');
  return [
    measure ? `Create a KPI card for ${toLabel(measure.name)}` : '',
    measure && dimension ? `Show ${toLabel(measure.name)} by ${toLabel(dimension.name)}` : '',
    request.dataModel ? `Build a table for ${modelLabelFor(request)}` : 'Choose a data model'
  ].filter(Boolean);
}

function modelLabelFor(request: BuilderAgentRequest): string {
  return request.dataModel?.businessName
    ?? readString(request.dataModel?.dictionary?.businessName)
    ?? request.tableName
    ?? request.dataModel?.name
    ?? 'selected model';
}

function toLabel(value: string): string {
  return splitWords(value).map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
}

function splitWords(value: string): string[] {
  const words: string[] = [];
  let current = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLower = code >= 97 && code <= 122;
    const isUpper = code >= 65 && code <= 90;
    if (isDigit || isLower || isUpper) {
      current += char.toLowerCase();
    } else if (current) {
      words.push(current);
      current = '';
    }
  }
  if (current) words.push(current);
  return words;
}
