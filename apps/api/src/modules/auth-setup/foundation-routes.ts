import type { IncomingMessage, ServerResponse } from 'node:http';
import { fail, uuidv7 } from '@intraq/contracts';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import { clearAuthCookie, readAuthCookie, setAuthCookie } from './auth-cookies.js';
import { createAccessToken, createRefreshToken, readBearerToken, verifyAccessToken } from './auth-tokens.js';
import type { AuthStore, AuthUserRecord } from './auth-store.js';
import { toSessionUser } from './auth-store.js';
import { hashPassword, verifyPassword } from './password-hashing.js';
import {
  isNonEmptyString,
  isRecord,
  optionalTrimmedString,
  sendRawJson
} from './foundation-route-utils.js';
import { handleSetupRoutes } from './setup-routes.js';

interface AuthSetupFoundationRoutesOptions {
  acceptAuthCookie?: boolean;
}

export class AuthSetupFoundationRoutes {
  constructor(
    private readonly authStore: AuthStore | null = null,
    private readonly options: AuthSetupFoundationRoutesOptions = {}
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      await this.login(req, res);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/profile') {
      await this.profile(req, res);
      return true;
    }
    if (req.method === 'PUT' && url.pathname === '/api/auth/profile') {
      await this.updateProfile(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
      await this.forgotPassword(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
      await this.resetPassword(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/refresh-token') {
      await this.refreshToken(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      clearAuthCookie(res);
      sendOk(res, { message: 'Logged out successfully' });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/change-password') {
      await this.changePassword(req, res);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/verify-email') {
      await this.validateRequiredEmail(req, res, 'Verification email processed');
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/resend-verification') {
      await this.validateRequiredEmail(req, res, 'Verification email sent');
      return true;
    }
    if (await handleSetupRoutes(req, res, url)) return true;
    return false;
  }

  private async login(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.email) || !isNonEmptyString(body.password)) {
      sendJson(res, 400, fail('Email and password are required'));
      return;
    }
    if (!this.authStore) {
      sendJson(res, 503, fail('Authentication database is unavailable'));
      return;
    }
    const user = await this.authStore.findUserByEmail(body.email.trim().toLowerCase());
    const validPassword = user ? await verifyPassword(body.password, user.password) : false;
    if (!user || !validPassword) {
      sendJson(res, 401, fail('Invalid email or password'));
      return;
    }
    if (!user.isActive) {
      sendJson(res, 403, fail('This user account is inactive'));
      return;
    }
    await this.authStore.updateLastLoginAt(user.id, new Date());
    await this.sendSession(res, user);
  }

  private async profile(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await this.authenticatedUser(req, res);
    if (!user) return;
    sendOk(res, toSessionUser(user));
  }

  private async updateProfile(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await this.authenticatedUser(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'Profile payload is required');
      return;
    }
    const firstName = optionalTrimmedString(body.firstName);
    const lastName = optionalTrimmedString(body.lastName);
    if (!firstName && !lastName) {
      sendBadRequest(res, 'First name or last name is required');
      return;
    }
    const profileUpdates: { firstName?: string; lastName?: string } = {};
    if (firstName) profileUpdates.firstName = firstName;
    if (lastName) profileUpdates.lastName = lastName;
    const updated = await this.authStore?.updateProfile(user.id, profileUpdates);
    if (!updated) {
      sendJson(res, 503, fail('Authentication database is unavailable'));
      return;
    }
    sendOk(res, toSessionUser(updated));
  }

  private async refreshToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.refreshToken)) {
      sendBadRequest(res, 'Refresh token is required');
      return;
    }
    if (!this.authStore) {
      sendJson(res, 503, fail('Authentication database is unavailable'));
      return;
    }
    const user = await this.authStore.findUserByRefreshToken(body.refreshToken, new Date());
    if (!user || !user.isActive) {
      sendJson(res, 401, fail('Refresh token is invalid or expired'));
      return;
    }
    await this.sendSession(res, user);
  }

  private async authenticatedUser(req: IncomingMessage, res: ServerResponse): Promise<AuthUserRecord | null> {
    if (!this.authStore) {
      sendJson(res, 503, fail('Authentication database is unavailable'));
      return null;
    }
    const payload = verifyAccessToken(this.readRequestToken(req));
    if (!payload) {
      sendJson(res, 401, fail('Authentication is required'));
      return null;
    }
    const user = await this.authStore.findUserById(payload.sub);
    if (!user || !user.isActive) {
      sendJson(res, 401, fail('Authentication is required'));
      return null;
    }
    return user;
  }

  private async sendSession(res: ServerResponse, user: AuthUserRecord): Promise<void> {
    const token = createAccessToken({ role: user.role, userId: user.id });
    const refreshToken = createRefreshToken();
    await this.authStore?.createRefreshToken({
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    });
    setAuthCookie(res, token);
    sendRawJson(res, 200, {
      success: true,
      token,
      refreshToken,
      user: toSessionUser(user)
    });
  }

  private readRequestToken(req: IncomingMessage): string | undefined {
    return readBearerToken(req.headers.authorization)
      ?? (this.options.acceptAuthCookie === true ? readAuthCookie(req) : undefined);
  }

  private async forgotPassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.email)) {
      sendBadRequest(res, 'Email is required');
      return;
    }
    if (this.authStore) {
      await this.authStore.createPasswordResetToken({
        token: `reset.${uuidv7()}`,
        userEmail: body.email.trim().toLowerCase(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60)
      });
    }
    sendRawJson(res, 200, {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  }

  private async resetPassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.token) || !isNonEmptyString(body.newPassword)) {
      sendBadRequest(res, 'Token and new password are required');
      return;
    }
    if (!this.authStore) {
      sendJson(res, 503, fail('Authentication database is unavailable'));
      return;
    }
    const reset = await this.authStore.resetPassword({
      token: body.token,
      password: await hashPassword(body.newPassword),
      at: new Date()
    });
    if (!reset) {
      sendJson(res, 404, fail('Password reset token is invalid or expired'));
      return;
    }
    sendOk(res, { message: 'Password reset successfully' });
  }

  private async changePassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const user = await this.authenticatedUser(req, res);
    if (!user) return;
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.currentPassword) || !isNonEmptyString(body.newPassword)) {
      sendBadRequest(res, 'Current password and new password are required');
      return;
    }
    if (!await verifyPassword(body.currentPassword, user.password)) {
      sendJson(res, 401, fail('Current password is incorrect'));
      return;
    }
    await this.authStore?.updatePassword(user.id, await hashPassword(body.newPassword));
    sendOk(res, { message: 'Password changed successfully' });
  }

  private async validateRequiredEmail(req: IncomingMessage, res: ServerResponse, message: string): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isNonEmptyString(body.email)) {
      sendBadRequest(res, 'Email is required');
      return;
    }
    sendOk(res, { message });
  }

}

export function createAuthSetupFoundationRoutes(
  authStore: AuthStore | null = null,
  options: AuthSetupFoundationRoutesOptions = {}
): AuthSetupFoundationRoutes {
  return new AuthSetupFoundationRoutes(authStore, options);
}
