export interface AuthUser {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role?: string;
  tenantId?: string;
  tenant?: {
    id?: string;
    name?: string;
    companyName?: string;
    settings?: Record<string, unknown>;
  };
}

export interface AuthTokens {
  accessToken?: string;
  refreshToken?: string;
  token?: string;
}

export interface AuthSession {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  tokens?: AuthTokens;
  user?: AuthUser;
  message?: string;
}

export interface SetupStatus {
  setupRequired: boolean;
  configured: boolean;
  deploymentType: string;
  environment?: string;
  setupCompleted?: boolean;
}

export interface SetupOptions {
  databaseTypes: string[];
  deploymentTypes: string[];
}

export interface HealthStatus {
  deploymentType?: string;
  environment?: string;
  status: string;
  service?: string;
  webOrigin?: string;
}

export interface MessageResult {
  adminUser?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  message?: string;
  setupCompletedAt?: string;
  configured?: boolean;
  valid?: boolean;
  verified?: boolean;
}

export interface BrandingConfig {
  accentColor?: string;
  appName?: string;
  brandHeader?: string;
  brandSubHeader?: string;
  companyName?: string;
  gradientEnd?: string;
  gradientStart?: string;
  faviconUrl?: string;
  deploymentType?: string;
  isSelfHosted?: boolean;
  primaryColor?: string;
  supportEmail?: string;
}

export interface HostTypeInfo {
  deploymentType?: string;
  hostType?: string;
  isSelfHosted?: boolean;
}

export interface SetupRunPayload {
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  companyDomain: string;
  companyName: string;
  enableDemoContent: boolean;
  enableSampleData: boolean;
}
