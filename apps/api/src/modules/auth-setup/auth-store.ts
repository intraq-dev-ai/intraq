import type { IntraQPrismaClient } from '@intraq/db';

export interface AuthTenant {
  domain?: string | null;
  id: string;
  name: string;
  settings?: unknown;
  status?: string;
  tenantType?: string;
}

export interface AuthUserRecord {
  email: string;
  emailVerified: boolean;
  firstName: string;
  id: string;
  isActive: boolean;
  lastName: string;
  password: string;
  role: string;
  tenant?: AuthTenant | null;
  tenantId?: string | null;
}

export interface AuthStore {
  createPasswordResetToken(input: { expiresAt: Date; token: string; userEmail: string }): Promise<boolean>;
  createRefreshToken(input: { expiresAt: Date; token: string; userId: string }): Promise<void>;
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  findUserByRefreshToken(token: string, at: Date): Promise<AuthUserRecord | null>;
  resetPassword(input: { at: Date; password: string; token: string }): Promise<boolean>;
  updateLastLoginAt(id: string, at: Date): Promise<void>;
  updatePassword(id: string, password: string): Promise<void>;
  updateProfile(id: string, profile: { firstName?: string; lastName?: string }): Promise<AuthUserRecord>;
}

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly client: IntraQPrismaClient) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.client.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { tenant: true }
    });
    return user ? toAuthUser(user) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const user = await this.client.user.findUnique({
      where: { id },
      include: { tenant: true }
    });
    return user ? toAuthUser(user) : null;
  }

  async findUserByRefreshToken(token: string, at: Date): Promise<AuthUserRecord | null> {
    const refreshToken = await this.client.refreshToken.findFirst({
      where: {
        token,
        expiresAt: { gt: at }
      },
      include: { user: { include: { tenant: true } } }
    });
    return refreshToken ? toAuthUser(refreshToken.user) : null;
  }

  async updateLastLoginAt(id: string, at: Date): Promise<void> {
    await this.client.user.update({ where: { id }, data: { lastLoginAt: at } });
  }

  async createRefreshToken(input: { expiresAt: Date; token: string; userId: string }): Promise<void> {
    await this.client.refreshToken.create({
      data: {
        token: input.token,
        userId: input.userId,
        expiresAt: input.expiresAt
      }
    });
  }

  async updateProfile(id: string, profile: { firstName?: string; lastName?: string }): Promise<AuthUserRecord> {
    const user = await this.client.user.update({
      where: { id },
      data: {
        ...(profile.firstName ? { firstName: profile.firstName } : {}),
        ...(profile.lastName ? { lastName: profile.lastName } : {})
      },
      include: { tenant: true }
    });
    return toAuthUser(user);
  }

  async updatePassword(id: string, password: string): Promise<void> {
    await this.client.user.update({ where: { id }, data: { password } });
  }

  async createPasswordResetToken(input: { expiresAt: Date; token: string; userEmail: string }): Promise<boolean> {
    const user = await this.client.user.findUnique({ where: { email: input.userEmail.toLowerCase() } });
    if (!user) return false;
    await this.client.passwordReset.create({
      data: {
        token: input.token,
        userId: user.id,
        expiresAt: input.expiresAt
      }
    });
    return true;
  }

  async resetPassword(input: { at: Date; password: string; token: string }): Promise<boolean> {
    return this.client.$transaction(async tx => {
      const reset = await tx.passwordReset.findFirst({
        where: {
          token: input.token,
          used: false,
          expiresAt: { gt: input.at }
        }
      });
      if (!reset) return false;
      await tx.user.update({ where: { id: reset.userId }, data: { password: input.password } });
      await tx.passwordReset.update({ where: { id: reset.id }, data: { used: true } });
      return true;
    });
  }
}

export function toSessionUser(user: AuthUserRecord): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role,
    tenantId: user.tenantId,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    tenant: user.tenant
      ? {
          id: user.tenant.id,
          name: user.tenant.name,
          companyName: user.tenant.name,
          domain: user.tenant.domain,
          settings: user.tenant.settings,
          status: user.tenant.status,
          tenantType: user.tenant.tenantType
        }
      : null
  };
}

type PrismaUserWithTenant = Awaited<ReturnType<IntraQPrismaClient['user']['findUnique']>> & {
  tenant?: {
    domain: string | null;
    id: string;
    name: string;
    settings?: unknown;
    status: string;
    tenantType: string;
  } | null;
};

function toAuthUser(user: NonNullable<PrismaUserWithTenant>): AuthUserRecord {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    password: user.password,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    tenantId: user.tenantId,
    tenant: user.tenant
      ? {
          id: user.tenant.id,
          name: user.tenant.name,
          domain: user.tenant.domain,
          settings: user.tenant.settings,
          status: user.tenant.status,
          tenantType: user.tenant.tenantType
        }
      : null
  };
}
