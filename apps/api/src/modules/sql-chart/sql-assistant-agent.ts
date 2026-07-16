import type { SqlEditorDataSource } from './sql-editor-data.js';
import { executeSqlEditorQuery } from './sql-editor-service.js';
import {
  createCodexAgentRuntime,
  type CodexAgentResult,
  type CodexAgentRuntime
} from '../codex-agent/codex-agent-runtime.js';
import type { CodexAgentTool } from '../codex-agent/codex-agent-tool-loop.js';
import { customerFacingMessage } from './sql-assistant-customer-facing.js';
import { listSqlAssistantTables } from './sql-assistant-table-catalog.js';
import { rawTableOnlySqlError } from './sql-assistant-raw-table-guard.js';

interface SqlAssistanceRequest {
  conversationId?: string | null;
  currentQuery?: string | null;
  parameterValues?: Record<string, unknown>;
  source: SqlEditorDataSource;
  tenantId?: string | null;
  userMessage: string;
}

type SqlAssistantEvent = Record<string, unknown>;
type SqlAssistantEvents = SqlAssistantEvent[];

const CODEX_PROVIDER = 'codex-oauth';

export class SqlAssistantAgentUnavailableError extends Error {
  constructor(
    readonly agentProvider: CodexAgentResult,
    message: string
  ) {
    super(message);
    this.name = 'SqlAssistantAgentUnavailableError';
  }
}

export class SqlAssistantAgent {
  constructor(
    private readonly codexAgent: CodexAgentRuntime = createCodexAgentRuntime()
  ) {}

  async assist(request: SqlAssistanceRequest): Promise<SqlAssistantEvents> {
    const preparedRequest = prepareBusinessLanguageRequest(request);
    const result = await this.codexAgent.runToolLoop<SqlAssistantEvents>({
      surface: 'sql-assistant',
      userPrompt: preparedRequest.userMessage,
      context: buildSqlAssistantContext(preparedRequest, request.userMessage),
      instructions: sqlAssistantInstructions(preparedRequest.source),
      maxTurns: 12,
      maxOutputTokens: 2000,
      tenantId: preparedRequest.tenantId ?? null,
      fallback: () => agentUnavailableEvents(preparedRequest),
      tools: sqlAssistantTools(preparedRequest)
    });

    if (result.type === 'tool_result' && Array.isArray(result.toolResult)) {
      return eventsWithCodexProvider(result.toolResult, result.provider);
    }
    if (result.type === 'answer') {
      const content = result.answer ?? result.provider.responseText ?? 'No answer returned.';
      const validation = await validateFinalSqlBlocks(preparedRequest.source, content, preparedRequest.parameterValues ?? {}, new Map());
      return messageEvents(
        validation.ok ? contentWithValidationSummary(content, validation.summaries) : validation.message,
        preparedRequest.conversationId ?? null,
        CODEX_PROVIDER,
        result.provider
      );
    }
    throw new SqlAssistantAgentUnavailableError(
      result.provider,
      sqlAssistantUnavailableMessage(result.provider)
    );
  }

}

function sqlAssistantTools(request: SqlAssistanceRequest): CodexAgentTool[] {
  const successfulRuns = new Map<string, { columns: string[]; rowCount: number }>();
  return [
    {
      terminal: false,
      definition: {
        type: 'function',
        name: 'list_tables',
        description: 'Search potential raw source tables and linked raw join partners for SQL Editor query generation. This tool returns raw_table candidates only.',
        parameters: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Optional routing domain such as pos-transactions, pos-payments, or pos-catalog.'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of matching tables to return.'
            },
            query: {
              type: 'string',
              description: 'The user question or concise business routing terms.'
            }
          }
        }
      },
      run: args => JSON.stringify(listSqlAssistantTables(request.source, args, request.userMessage))
    },
    {
      terminal: false,
      definition: {
        type: 'function',
        name: 'get_table_schema',
        description: 'Get the columns, types, and metadata for a specific table. Call this before writing SQL involving that table.',
        parameters: {
          type: 'object',
          properties: {
            table_name: {
              type: 'string',
              description: 'The exact table name to inspect.'
            }
          },
          required: ['table_name']
        }
      },
      run: args => {
        const name = asString(args.table_name);
        const table = request.source.tables.find(t => t.name === name);
        if (!table) return JSON.stringify({ error: `Table "${name}" not found. Call list_tables first.` });
        if (table.targetType !== 'raw_table') {
          return JSON.stringify({
            error: `SQL Editor creates data models from raw source tables only. "${name}" is an existing data_model. Call list_tables to find raw_table sources.`
          });
        }
        return JSON.stringify({
          table: table.name,
          targetType: table.targetType,
          isDataModel: table.isDataModel,
          hasSqlQuery: table.hasSqlQuery,
          description: table.description ?? null,
          guidance: table.guidance,
          columns: table.columns.map(col => ({
            name: col.name,
            label: col.label ?? col.name,
            type: col.type,
            description: col.description ?? null,
            role: (col as unknown as Record<string, unknown>).role ?? null
          }))
        });
      }
    },
    {
      terminal: false,
      definition: {
        type: 'function',
        name: 'execute_sql',
        description: 'Run a candidate read-only SELECT query against the selected data source with a small limit. Use this before final answer; revise and retry when it returns an error.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            parameterValues: {
              type: 'object',
              description: 'Optional SQL model parameter values keyed by parameter name.'
            },
            sql: {
              type: 'string',
              description: 'The complete read-only SELECT or WITH query to validate.'
            }
          },
          required: ['sql']
        }
      },
      run: async args => {
        const sql = asString(args.sql);
        if (!sql) return JSON.stringify({ success: false, error: 'sql is required' });
        const rawTableError = rawTableOnlySqlError(request.source, sql);
        if (rawTableError) return JSON.stringify({ success: false, error: rawTableError });
        const parameterValues = readParameterValues(args, request.parameterValues ?? {});
        const result = await executeSqlEditorQuery(request.source.id, sql, { defaultLimit: 20, maxLimit: 20, parameterValues });
        if (!result.ok) {
          return JSON.stringify({ success: false, statusCode: result.statusCode, error: result.error });
        }
        successfulRuns.set(validationKey(sql, parameterValues), {
          columns: result.data.columns,
          rowCount: result.data.rowCount
        });
        return JSON.stringify({
          success: true,
          columns: result.data.columns,
          rowCount: result.data.rowCount,
          sampleRows: result.data.rows.slice(0, 3)
        });
      }
    },
    {
      terminal: true,
      definition: {
        type: 'function',
        name: 'answer',
        description: 'Return your final answer to the user — SQL query, explanation, or both.',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The complete response. For SQL queries wrap them in ```sql blocks.'
            }
          },
          required: ['content']
        }
      },
      run: async args => {
        const content = asString(args.content) || 'No answer returned.';
        const validation = await validateFinalSqlBlocks(request.source, content, request.parameterValues ?? {}, successfulRuns);
        if (!validation.ok) {
          return messageEvents(validation.message, request.conversationId ?? null, CODEX_PROVIDER);
        }
        return messageEvents(contentWithValidationSummary(content, validation.summaries), request.conversationId ?? null, CODEX_PROVIDER);
      }
    }
  ];
}

function agentUnavailableEvents(request: SqlAssistanceRequest): SqlAssistantEvents {
  return messageEvents(
    'SQL Assistant AI agent is unavailable.',
    request.conversationId ?? null,
    CODEX_PROVIDER
  );
}

function messageEvents(
  message: string,
  conversationId: string | null,
  provider: string,
  agentProvider?: CodexAgentResult
): SqlAssistantEvents {
  const safeMessage = customerFacingMessage(message);
  const base = [
    { type: 'chunk', content: safeMessage, fullContent: safeMessage, provider },
    { type: 'complete', fullContent: safeMessage, provider, conversationId }
  ];
  return agentProvider ? base.map(event => ({ ...event, agentProvider })) : base;
}

function eventsWithCodexProvider(events: SqlAssistantEvents, agentProvider: CodexAgentResult): SqlAssistantEvents {
  return events.map(event => ({ ...event, provider: CODEX_PROVIDER, agentProvider }));
}

function buildSqlAssistantContext(request: SqlAssistanceRequest, originalUserMessage: string): Record<string, unknown> {
  return {
    activeParameterValues: request.parameterValues ?? {},
    databaseType: request.source.type,
    dataSourceName: request.source.name,
    currentQuery: request.currentQuery ?? null,
    originalUserMessage,
    businessLanguageInput: true
  };
}

function sqlAssistantInstructions(source: SqlAssistanceRequest['source']): string {
  return [
    `You are an expert SQL assistant embedded in a SQL editor.`,
    `The user is connected to a ${source.type} database named "${source.name}".`,
    `The user prompt is business language, not SQL. Do not require the user to provide SQL, table names, join keys, or column names.`,
    `Use the configured schema and tools internally to translate business questions into validated SQL.`,
    `When wording is casual or imperfect, infer the business intent from table guidance before assuming a SQL keyword meaning.`,
    `Product boundary: Dashboard Builder consumes saved data_model tables; SQL Editor creates data models from raw_table sources.`,
    `You have tools to discover the schema — use them before writing SQL:`,
    `- Call list_tables with the user's question in query to find potential raw_table source tables and linked raw join partners.`,
    `- Use linkedTables from list_tables to identify join paths, then inspect those linked raw tables with get_table_schema before using them.`,
    `- Call get_table_schema(table_name) for each table you need to understand before writing SQL.`,
    `- Call execute_sql(sql, parameterValues) with the candidate query before the final answer. If execution returns an error, fix the SQL and call execute_sql again.`,
    `- Do NOT guess or invent table names or column names. Always verify with get_table_schema first.`,
    `Only write SQL against tables marked targetType "raw_table". Never write SQL that selects from targetType "data_model" tables.`,
    `Tables marked targetType "data_model" are existing saved models for Dashboard Builder and are not valid SQL Editor source tables.`,
    `A data model is a reusable mart: it should have a clear row grain and reusable dimensions, measures, and time fields that can answer multiple related business questions.`,
    `For every SQL request, return one complete read-only SELECT query against raw_table sources that can be saved as model SQL. Do not bake in one-off ranking, report-only filters, ORDER BY, or LIMIT unless the user explicitly asks for a narrow ad-hoc query instead of a reusable model.`,
    `Once you understand the schema and have run the candidate SQL, write accurate SQL directly in your answer using \`\`\`sql blocks.`,
    `Apply correct date filtering when the user says "last week", "yesterday", "this month", etc.`,
    `For ranking queries (top N, best, most), aggregate across the full date range — do not group by date unless the user asks for a trend.`,
    `If the user has a query in the editor already, revise it rather than starting from scratch.`,
    `Do not mention internal tools, providers, sessions, model setup, or conversation IDs in your answers.`,
    `Be concise and direct.`
  ].join('\n');
}

function prepareBusinessLanguageRequest(request: SqlAssistanceRequest): SqlAssistanceRequest {
  const normalizedPrompt = normalizeBusinessPrompt(request.source, request.userMessage);
  if (normalizedPrompt === request.userMessage) return request;
  return { ...request, userMessage: normalizedPrompt };
}

function normalizeBusinessPrompt(source: SqlEditorDataSource, userMessage: string): string {
  const message = userMessage.trim();
  if (!message || looksLikeSqlStatement(message)) return userMessage;
  if (isSalesByOrderByPrompt(message) && hasTables(source, ['Invoice', 'InvoiceOrderType'])) {
    return [
      'Business request: aggregate sales by order type / order channel.',
      `Original user wording: ${message}`,
      'Treat "sales by order by" as casual wording for "sales by order type", not as the SQL ORDER BY keyword.',
      'Use base/raw source tables Invoice and InvoiceOrderType.',
      'Join Invoice.InvoiceOrderType = InvoiceOrderType.InvoiceOrderTypeId.',
      'Group by InvoiceOrderType.DisplayName, and include useful sales measures such as invoice count and total sales.',
      'Apply active-order filters when present: Invoice.Archived = 0 or null-safe equivalent, Invoice.Void = 0 OR Invoice.Void IS NULL, Invoice.DeletedBy IS NULL, and Invoice.DeletedOnUtc IS NULL.',
      'Do not use SQL views for this business request when equivalent base tables are available.'
    ].join('\n');
  }
  return userMessage;
}

function isSalesByOrderByPrompt(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return /\bsales?\b/.test(normalized)
    && (
      /\bby order by\b/.test(normalized)
      || /\bby order type\b/.test(normalized)
      || /\bby order channel\b/.test(normalized)
      || /\border type\b/.test(normalized)
      || /\border channel\b/.test(normalized)
    );
}

function looksLikeSqlStatement(value: string): boolean {
  return /```sql/i.test(value) || /\bselect\b[\s\S]+\bfrom\b/i.test(value);
}

function hasTables(source: SqlEditorDataSource, names: string[]): boolean {
  const available = new Set(source.tables.map(table => table.name.toLowerCase()));
  return names.every(name => available.has(name.toLowerCase()));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNullableString(value: unknown): string | null {
  const text = asString(value);
  return text || null;
}

function readParameterValues(args: Record<string, unknown>, fallback: Record<string, unknown>): Record<string, unknown> {
  return isRecord(args.parameterValues) ? args.parameterValues : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function validateFinalSqlBlocks(
  source: SqlEditorDataSource,
  content: string,
  parameterValues: Record<string, unknown>,
  successfulRuns: Map<string, { columns: string[]; rowCount: number }>
): Promise<
  | { ok: true; summaries: Array<{ columns: string[]; rowCount: number }> }
  | { ok: false; message: string }
> {
  const sqlBlocks = extractSqlBlocks(content);
  if (sqlBlocks.length === 0) return { ok: true, summaries: [] };
  const summaries: Array<{ columns: string[]; rowCount: number }> = [];
  for (const sql of sqlBlocks) {
    const rawTableError = rawTableOnlySqlError(source, sql);
    if (rawTableError) {
      return {
        ok: false,
        message: [
          'I could not validate the final SQL, so I am not returning it as a saveable data model yet.',
          rawTableError,
          'Please ask me to revise it with the same business goal.'
        ].join(' ')
      };
    }
    const key = validationKey(sql, parameterValues);
    const cached = successfulRuns.get(key);
    if (cached) {
      summaries.push(cached);
      continue;
    }
    const result = await executeSqlEditorQuery(source.id, sql, { defaultLimit: 20, maxLimit: 20, parameterValues });
    if (!result.ok) {
      return {
        ok: false,
        message: [
          'I could not validate the final SQL, so I am not returning it as a saveable data model yet.',
          `Execution error: ${result.error}`,
          'Please ask me to revise it with the same business goal.'
        ].join(' ')
      };
    }
    const summary = { columns: result.data.columns, rowCount: result.data.rowCount };
    successfulRuns.set(key, summary);
    summaries.push(summary);
  }
  return { ok: true, summaries };
}

function extractSqlBlocks(content: string): string[] {
  return Array.from(content.matchAll(/```sql\s*([\s\S]*?)```/gi))
    .map(match => match[1]?.trim() ?? '')
    .filter(Boolean);
}

function contentWithValidationSummary(
  content: string,
  summaries: Array<{ columns: string[]; rowCount: number }>
): string {
  if (summaries.length === 0) return content;
  const first = summaries[0];
  if (!first) return content;
  return [
    content,
    '',
    `Validated successfully against the selected data source (${first.rowCount} sample row${first.rowCount === 1 ? '' : 's'}, ${first.columns.length} column${first.columns.length === 1 ? '' : 's'}).`
  ].join('\n');
}

function normalizeSqlForValidation(sql: string): string {
  return sql.trim().replace(/;\s*$/, '').replace(/\s+/g, ' ').toLowerCase();
}

function validationKey(sql: string, parameterValues: Record<string, unknown>): string {
  return `${normalizeSqlForValidation(sql)}\n${JSON.stringify(parameterValues, Object.keys(parameterValues).sort())}`;
}

function sqlAssistantUnavailableMessage(provider: CodexAgentResult): string {
  if (provider.fallbackReason === 'openai_api_key_not_configured') {
    return 'SQL Assistant AI requires an OpenAI API key to be configured.';
  }
  if (provider.fallbackReason === 'openai_agent_disabled') {
    return 'SQL Assistant OpenAI agent is disabled.';
  }
  if (provider.fallbackReason === 'openai_request_failed') {
    return 'SQL Assistant AI could not complete the OpenAI request.';
  }
  if (provider.fallbackReason === 'openai_tool_loop_turn_limit') {
    return 'SQL Assistant AI reached its tool-loop turn limit.';
  }
  if (provider.fallbackReason === 'codex_oauth_not_configured') {
    return 'SQL Assistant AI requires Codex OAuth to be connected.';
  }
  if (provider.fallbackReason === 'codex_agent_disabled') {
    return 'SQL Assistant AI agent is disabled.';
  }
  if (provider.fallbackReason === 'codex_request_failed') {
    return 'SQL Assistant AI could not complete the Codex OAuth request.';
  }
  if (provider.fallbackReason === 'codex_tool_loop_turn_limit') {
    return 'SQL Assistant AI reached its tool-loop turn limit.';
  }
  return 'SQL Assistant AI is unavailable.';
}
