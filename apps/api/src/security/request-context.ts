import type { IncomingMessage } from 'node:http';

export interface RequestSecurityContext {
  authSubjectType?: string;
  role: string;
  tenantId?: string;
  tenantType?: string;
  tokenScopes?: string[];
  userId: string;
}

const requestContexts = new WeakMap<IncomingMessage, RequestSecurityContext>();

export function setRequestSecurityContext(req: IncomingMessage, context: RequestSecurityContext): void {
  requestContexts.set(req, context);
}

export function getRequestSecurityContext(req: IncomingMessage): RequestSecurityContext | undefined {
  return requestContexts.get(req);
}
