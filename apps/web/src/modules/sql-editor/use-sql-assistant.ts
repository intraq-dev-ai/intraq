import { computed, ref, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { uuidv7 } from '@intraq/contracts';
import {
  createSqlAssistantConversation,
  requestSqlAssistance,
  resetSqlAssistantConversation,
  restoreSqlAssistantConversation
} from './api';
import {
  clearSqlAssistantDurableSession,
  readSqlAssistantDurableSession,
  writeSqlAssistantDurableSession
} from './sql-assistant-session-storage';
import type { SqlAssistantDurableSession, SqlAssistantMessage } from './sql-assistant-session-storage';
import type { SqlAssistantConversationSnapshot } from './types';
import { assistantPartialReplacement, assistantSql, assistantSqlBlocks } from './workflow';
import type { AssistantSqlReplacementType } from './workflow';

interface UseSqlAssistantOptions {
  currentQuery: Ref<string>;
  dataSourceId: Ref<string>;
  dataSourceName: ComputedRef<string>;
  parameterValues: Ref<Record<string, string>>;
  setQuery: (query: string, trackUndo: boolean) => void;
  setStatus: (status: string) => void;
}

export type { SqlAssistantMessage } from './sql-assistant-session-storage';

export function useSqlAssistant(options: UseSqlAssistantOptions) {
  const restored = sessionForDataSource(options.dataSourceId.value);
  const conversationId = ref(restored.conversationId);
  const messages = ref<SqlAssistantMessage[]>(restored.messages);
  const prompt = ref('');
  const response = ref(restored.response);
  const error = ref('');
  const status = ref('Ready for SQL requests.');
  const isRunning = ref(false);
  const abortController = ref<AbortController | null>(null);
  let suppressNextPersist = false;
  let restoreSequence = 0;
  const canApply = computed(() => hasAssistantSql(response.value) && !isRunning.value);
  const canStop = computed(() => isRunning.value);
  const placeholder = computed(() => {
    return options.dataSourceName.value.trim()
      ? 'Ask me anything about SQL queries...'
      : 'Select a data source to enable AI assistance';
  });

  watch(() => options.dataSourceId.value, (nextDataSourceId, previousDataSourceId) => {
    if (previousDataSourceId) persistSession(previousDataSourceId);
    if (isRunning.value) stop();
    restoreSession(nextDataSourceId);
    void hydrateBackendSession(nextDataSourceId);
  });

  watch([conversationId, messages, response], () => {
    if (suppressNextPersist) {
      suppressNextPersist = false;
      return;
    }
    persistSession();
  }, { deep: true });

  void hydrateBackendSession(options.dataSourceId.value);

  function persistSession(dataSourceId = options.dataSourceId.value): void {
    writeSqlAssistantDurableSession(dataSourceId, {
      conversationId: conversationId.value,
      messages: messages.value,
      response: response.value
    });
  }

  async function run(): Promise<void> {
    const userMessage = prompt.value.trim();
    const dataSourceId = options.dataSourceId.value;
    if (!dataSourceId) {
      setAssistantError('Choose a data source before asking the SQL assistant.', 'SQL assistant needs a data source');
      return;
    }
    if (!userMessage) {
      setAssistantError('Enter a business question or SQL instruction before asking.', 'SQL assistant needs an instruction');
      return;
    }

    isRunning.value = true;
    const controller = new AbortController();
    abortController.value = controller;
    error.value = '';
    response.value = '';
    status.value = 'Asking SQL assistant...';
    options.setStatus('Asking SQL assistant...');
    appendMessage('user', userMessage);
    prompt.value = '';
    try {
      const assistance = await requestSqlAssistance(dataSourceId, userMessage, options.currentQuery.value, {
        conversationId: conversationId.value,
        parameterValues: options.parameterValues.value,
        signal: controller.signal
      });
      if (options.dataSourceId.value !== dataSourceId) return;
      if (assistance.conversationId) conversationId.value = assistance.conversationId;
      const nextResponse = assistance.content.trim();
      if (!nextResponse) throw new Error('SQL assistant returned an empty response.');
      response.value = nextResponse;
      appendMessage('assistant', nextResponse);
      status.value = 'Assistant response ready.';
      options.setStatus('SQL assistant response received');
    } catch (caught) {
      if (options.dataSourceId.value !== dataSourceId) return;
      if (controller.signal.aborted) {
        appendMessage('status', 'Assistant generation stopped.');
        status.value = 'SQL assistant stopped';
        options.setStatus('SQL assistant stopped');
      } else {
        setAssistantError(errorMessage(caught, 'SQL assistant failed.'), 'SQL assistant error');
      }
    } finally {
      isRunning.value = false;
      if (abortController.value === controller) abortController.value = null;
    }
  }

  function apply(content = response.value): void {
    if (!hasAssistantSql(content)) {
      setAssistantError('Ask the SQL assistant before applying SQL.', 'No assistant SQL to apply');
      return;
    }
    const sql = assistantSql(content);
    const replacementType = assistantSqlBlocks(content)[0]?.replacementType ?? 'full';
    options.setQuery(queryForApply(sql, replacementType, options.currentQuery.value, content), true);
    error.value = '';
    status.value = replacementType === 'append'
      ? 'Assistant SQL appended to the editor.'
      : 'Assistant SQL replaced the editor query.';
    options.setStatus(replacementType === 'append' ? 'Appended assistant SQL' : 'Applied assistant SQL');
  }

  function replace(content = response.value): void {
    if (!hasAssistantSql(content)) {
      setAssistantError('Ask the SQL assistant before replacing SQL.', 'No assistant SQL to replace');
      return;
    }
    const sql = assistantSql(content);
    options.setQuery(sql, true);
    error.value = '';
    status.value = 'Assistant SQL applied to the editor.';
    options.setStatus('Applied assistant SQL');
  }

  function stop(): void {
    abortController.value?.abort();
  }

  async function newChat(): Promise<void> {
    const dataSourceId = options.dataSourceId.value;
    prompt.value = '';
    response.value = '';
    error.value = '';
    messages.value = [];
    conversationId.value = uuidv7();
    status.value = 'New SQL assistant chat ready.';
    options.setStatus('New SQL assistant chat');
    if (!dataSourceId) return;
    try {
      const snapshot = await createSqlAssistantConversation(dataSourceId, 'New SQL conversation');
      if (options.dataSourceId.value !== dataSourceId || messages.value.length > 0) return;
      applyBackendSnapshot(snapshot, 'New SQL assistant chat ready.');
    } catch {
      persistSession(dataSourceId);
    }
  }

  async function resetSession(): Promise<void> {
    const dataSourceId = options.dataSourceId.value;
    const previousConversationId = conversationId.value;
    stop();
    clearSqlAssistantDurableSession(dataSourceId);
    suppressNextPersist = true;
    prompt.value = '';
    response.value = '';
    error.value = '';
    messages.value = [];
    conversationId.value = uuidv7();
    status.value = 'Ready for SQL requests.';
    options.setStatus('SQL assistant reset');
    if (!dataSourceId || !previousConversationId) return;
    try {
      const snapshot = await resetSqlAssistantConversation(dataSourceId, previousConversationId);
      if (options.dataSourceId.value !== dataSourceId) return;
      applyBackendSnapshot(snapshot, 'Ready for SQL requests.');
    } catch {
      persistSession(dataSourceId);
    }
  }

  function setAssistantError(message: string, nextStatus: string): void {
    error.value = message;
    appendMessage('status', message);
    status.value = nextStatus;
    options.setStatus(nextStatus);
  }

  function restoreSession(dataSourceId: string): void {
    const session = sessionForDataSource(dataSourceId);
    suppressNextPersist = true;
    prompt.value = '';
    response.value = session.response;
    error.value = '';
    messages.value = session.messages;
    conversationId.value = session.conversationId;
    status.value = 'Ready for SQL requests.';
  }

  async function hydrateBackendSession(dataSourceId: string): Promise<void> {
    const id = dataSourceId.trim();
    if (!id) return;
    const sequence = ++restoreSequence;
    try {
      const localConversationId = messages.value.length > 0 || response.value ? conversationId.value : undefined;
      const snapshot = await restoreSqlAssistantConversation(id, localConversationId);
      if (sequence !== restoreSequence || options.dataSourceId.value !== id || !snapshot) return;
      applyBackendSnapshot(snapshot, 'Ready for SQL requests.');
    } catch {
      // Local storage remains a fallback when the assistant conversation API is unavailable.
    }
  }

  function applyBackendSnapshot(snapshot: SqlAssistantConversationSnapshot, nextStatus: string): void {
    suppressNextPersist = true;
    conversationId.value = snapshot.conversation.id;
    messages.value = snapshot.messages.map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt
    }));
    response.value = [...messages.value].reverse().find(message => message.role === 'assistant')?.content ?? '';
    error.value = '';
    status.value = nextStatus;
    persistSession(snapshot.conversation.dataSourceId);
  }

  function appendMessage(role: SqlAssistantMessage['role'], content: string): void {
    messages.value = [...messages.value, {
      id: uuidv7(),
      role,
      content,
      createdAt: new Date().toISOString()
    }].slice(-20);
  }

  return {
    canApply,
    canStop,
    conversationId,
    error,
    isRunning,
    messages,
    placeholder,
    prompt,
    response,
    status,
    apply,
    newChat,
    replace,
    resetSession,
    run,
    stop
  };
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function hasAssistantSql(content: string): boolean {
  const sql = assistantSql(content);
  return /^(select|with)\b/i.test(sql.trim());
}

function sessionForDataSource(dataSourceId: string): SqlAssistantDurableSession {
  const session = readSqlAssistantDurableSession(dataSourceId);
  return {
    conversationId: session.conversationId || uuidv7(),
    messages: session.messages,
    response: session.response
  };
}

function queryForApply(sql: string, replacementType: AssistantSqlReplacementType, currentQuery: string, content: string): string {
  if (replacementType === 'partial') {
    const partial = assistantPartialReplacement(content, currentQuery);
    if (partial) return partial;
  }
  if (replacementType !== 'append') return sql;
  const current = currentQuery.trimEnd();
  return current ? `${current}\n\n${sql}` : sql;
}
