import { requestAdmin } from './api';

export interface AdminReleaseInfo {
  buildId: string;
  channel: string;
  commit: string | null;
  deploymentType: string;
  packageType: string;
  releaseNotes: string[];
  releasedAt: string | null;
  version: string;
}

const fallbackReleaseInfo: AdminReleaseInfo = {
  buildId: 'local',
  channel: 'stable',
  commit: null,
  deploymentType: 'self-hosted',
  packageType: 'source',
  releaseNotes: [],
  releasedAt: null,
  version: '0.0.0'
};

export async function fetchAdminReleaseInfo(): Promise<AdminReleaseInfo> {
  return normalizeReleaseInfo(await requestAdmin<unknown>('/api/platform/release-info'));
}

export function normalizeReleaseInfo(value: unknown): AdminReleaseInfo {
  if (!isRecord(value)) return fallbackReleaseInfo;
  return {
    buildId: readString(value.buildId, fallbackReleaseInfo.buildId),
    channel: readString(value.channel, fallbackReleaseInfo.channel),
    commit: typeof value.commit === 'string' && value.commit.trim() ? value.commit.trim() : null,
    deploymentType: readString(value.deploymentType, fallbackReleaseInfo.deploymentType),
    packageType: readString(value.packageType, fallbackReleaseInfo.packageType),
    releaseNotes: Array.isArray(value.releaseNotes)
      ? value.releaseNotes.filter(isNonEmptyString).map(note => note.trim())
      : [],
    releasedAt: typeof value.releasedAt === 'string' && value.releasedAt.trim() ? value.releasedAt.trim() : null,
    version: readString(value.version, fallbackReleaseInfo.version)
  };
}

export function releaseVersionLabel(info: AdminReleaseInfo | null): string {
  return info ? `Version ${info.version}` : 'Version unavailable';
}

export function releasePackageLabel(info: AdminReleaseInfo | null): string {
  if (!info) return 'Release details are loading.';
  if (info.packageType === 'node-pm2') return 'Self-hosted package';
  if (info.packageType === 'docker') return 'Docker image';
  if (info.packageType === 'source') return 'Source package';
  if (info.packageType === 'web') return 'Web package';
  return titleCase(info.packageType);
}

export function releaseChannelLabel(info: AdminReleaseInfo | null): string {
  if (!info) return '';
  return titleCase(info.channel);
}

export function releaseDeploymentLabel(info: AdminReleaseInfo): string {
  if (info.deploymentType === 'self-hosted') return 'Self-hosted';
  return titleCase(info.deploymentType);
}

export function releaseDateLabel(info: AdminReleaseInfo): string {
  if (!info.releasedAt) return '';
  const timestamp = Date.parse(info.releasedAt);
  if (!Number.isFinite(timestamp)) return info.releasedAt;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp));
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
