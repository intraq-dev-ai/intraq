import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AnalyzerHistoryStore } from './history-foundation-store.js';

export async function handleAnalyzerBusinessScopeRoute(
  _req: IncomingMessage,
  _res: ServerResponse,
  _url: URL,
  _store: AnalyzerHistoryStore,
  _canReadDataSource: (dataSourceId: string) => Promise<boolean>
): Promise<boolean> {
  return false;
}
