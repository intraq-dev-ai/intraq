const MIN_AUTH_TOKEN_SECRET_LENGTH = 32;

export function resolveAuthTokenSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.AUTH_TOKEN_SECRET?.trim() || env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('AUTH_TOKEN_SECRET or JWT_SECRET is required before starting the API.');
  }

  if (secret.length < MIN_AUTH_TOKEN_SECRET_LENGTH) {
    throw new Error(`AUTH_TOKEN_SECRET or JWT_SECRET must be at least ${MIN_AUTH_TOKEN_SECRET_LENGTH} characters.`);
  }
  return secret;
}

export function validateRuntimeSecrets(env: NodeJS.ProcessEnv): void {
  resolveAuthTokenSecret(env);
}
