import { clearAuthSession } from '../auth/session-storage';

const SESSION_KEYS = [
  'auth_token',
  'token',
  'refreshToken',
  'refresh_token',
  'userRole',
  'intraq-role',
  'role'
];

export async function logoutSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{}'
    });
  } catch {
    // Local session cleanup still needs to happen when the API is unavailable.
  }
  clearShellSession();
}

export function clearShellSession(): void {
  clearAuthSession();
  for (const key of SESSION_KEYS) localStorage.removeItem(key);
}
