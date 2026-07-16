import type { IncomingMessage } from 'node:http';
import { getRequestSecurityContext } from '../../security/request-context.js';
import {
  type AnalyzerHistoryAccess
} from './history-foundation-store.js';

export function analyzerHistoryAccessForRequest(req: IncomingMessage): AnalyzerHistoryAccess | null {
  const context = getRequestSecurityContext(req);
  const tenantId = context?.tenantId?.trim();
  const userId = context?.userId?.trim();
  if (!tenantId || !userId) return null;
  return {
    tenantId,
    userId
  };
}
