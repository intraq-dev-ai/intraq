export class DashboardActionHandledError extends Error {
  constructor(message: string, readonly status: string) {
    super(message);
    this.name = 'DashboardActionHandledError';
  }
}

export function isDashboardActionHandledError(value: unknown): value is DashboardActionHandledError {
  if (value instanceof DashboardActionHandledError) return true;
  if (!isRecord(value)) return false;
  return value.name === 'DashboardActionHandledError' && typeof value.status === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
