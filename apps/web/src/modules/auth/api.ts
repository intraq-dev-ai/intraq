import type { ApiResponse } from '@intraq/contracts';
import type {
  AuthSession,
  BrandingConfig,
  HealthStatus,
  MessageResult,
  SetupRunPayload,
  SetupOptions,
  SetupStatus
} from './types';

type JsonBody = Record<string, unknown>;

export async function login(email: string, password: string): Promise<AuthSession> {
  return requestJson<AuthSession>('/api/auth/login', { method: 'POST', body: { email, password } });
}

export async function forgotPassword(email: string): Promise<MessageResult> {
  return requestJson<MessageResult>('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(token: string, newPassword: string): Promise<MessageResult> {
  return requestJson<MessageResult>('/api/auth/reset-password', { method: 'POST', body: { token, newPassword } });
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return requestJson<SetupStatus>('/api/setup/status');
}

export async function fetchSetupOptions(): Promise<SetupOptions> {
  return requestJson<SetupOptions>('/api/setup/options');
}

export async function runSetup(body: SetupRunPayload): Promise<MessageResult> {
  return requestJson<MessageResult>('/api/setup/run', { method: 'POST', body: { ...body } });
}

export async function fetchHealth(): Promise<HealthStatus> {
  return requestJson<HealthStatus>('/api/health');
}

export async function fetchBrandingConfig(): Promise<BrandingConfig> {
  return requestJson<BrandingConfig>('/api/branding/config');
}

async function requestJson<TData>(
  path: string,
  options: { method?: string; body?: JsonBody } = {}
): Promise<TData> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = storedAuthToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await parseJson(path, response);
  if (!response.ok) throw new Error(readError(payload, path, response.status));
  return unwrapPayload<TData>(payload, path);
}

async function parseJson(path: string, response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(unexpectedResponseMessage(path));
  }
}

function unwrapPayload<TData>(payload: unknown, path: string): TData {
  if (!isRecord(payload) || typeof payload.success !== 'boolean') {
    throw new Error(unexpectedResponseMessage(path));
  }
  if (!payload.success) throw new Error(readError(payload, path, 200));
  if ('data' in payload) return payload.data as TData;
  return payload as TData;
}

function readError(payload: unknown, path: string, status: number): string {
  if (isRecord(payload)) {
    const error = typeof payload.error === 'string' ? payload.error : '';
    if (isApiResponse(payload) && !payload.success) return payload.error;
    if (error) return error;
  }
  const genericMessage = genericAuthFailureMessage(path);
  if (genericMessage) return genericMessage;
  return `Request to ${path} failed with status ${status}.`;
}

function unexpectedResponseMessage(path: string): string {
  return genericAuthFailureMessage(path) || `Response from ${path} was not valid JSON.`;
}

function genericAuthFailureMessage(path: string): string {
  if (path === '/api/auth/login') return 'Login failed. Please try again.';
  return '';
}

function storedAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('auth_token')
    ?? window.localStorage.getItem('token')
    ?? window.localStorage.getItem('accessToken')
    ?? '';
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return isRecord(value) && typeof value.success === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
