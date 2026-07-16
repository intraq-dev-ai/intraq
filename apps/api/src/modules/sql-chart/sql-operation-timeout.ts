const DEFAULT_SQL_OPERATION_TIMEOUT_MS = 16_000;
const MAX_SQL_OPERATION_TIMEOUT_MS = 300_000;
const MIN_SQL_OPERATION_TIMEOUT_MS = 1_000;

export class SqlOperationTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlOperationTimeoutError';
  }
}

export async function withSqlOperationTimeout<T>(
  operation: Promise<T>,
  message = 'SQL operation timed out.',
  timeoutMs?: number
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new SqlOperationTimeoutError(message));
        }, sqlOperationTimeoutMs(timeoutMs));
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sqlOperationTimeoutMs(overrideMs?: number): number {
  if (typeof overrideMs === 'number' && Number.isFinite(overrideMs) && overrideMs > 0) {
    return Math.min(MAX_SQL_OPERATION_TIMEOUT_MS, Math.max(MIN_SQL_OPERATION_TIMEOUT_MS, Math.floor(overrideMs)));
  }
  const parsed = Number(process.env.INTRAQ_SQL_ROUTE_TIMEOUT_MS ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SQL_OPERATION_TIMEOUT_MS;
  return Math.min(MAX_SQL_OPERATION_TIMEOUT_MS, Math.max(MIN_SQL_OPERATION_TIMEOUT_MS, Math.floor(parsed)));
}
