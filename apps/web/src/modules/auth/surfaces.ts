export type AuthSurfaceMode =
  | 'login'
  | 'forgot'
  | 'reset'
  | 'setup'
  | 'backend-error';

export interface AuthSurface {
  id: AuthSurfaceMode;
  eyebrow: string;
  title: string;
  description: string;
}

const surfaces: Record<string, AuthSurface> = {
  login: {
    id: 'login',
    eyebrow: 'Access',
    title: 'Login',
    description: 'Sign in with tenant credentials and continue to the workspace.'
  },
  'forgot-password': {
    id: 'forgot',
    eyebrow: 'Access',
    title: 'Forgot Password',
    description: 'Request a reset link without exposing whether the account exists.'
  },
  'reset-password': {
    id: 'reset',
    eyebrow: 'Access',
    title: 'Reset Password',
    description: 'Complete password recovery with a token and replacement password.'
  },
  setup: {
    id: 'setup',
    eyebrow: 'Setup',
    title: 'Setup',
    description: 'Finish the first-time setup for this self-hosted workspace.'
  },
  'backend-error': {
    id: 'backend-error',
    eyebrow: 'System',
    title: 'Backend Error',
    description: 'Run a backend health check and expose recovery state for operators.'
  }
};

export function resolveAuthSurface(routeName: unknown): AuthSurface {
  return surfaces[String(routeName)] ?? surfaces.login as AuthSurface;
}
