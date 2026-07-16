import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PlatformReleaseInfo {
  buildId: string;
  channel: string;
  commit: string | null;
  deploymentType: string;
  packageType: string;
  releaseNotes: string[];
  releasedAt: string | null;
  version: string;
}

interface ReleaseManifest {
  buildId?: unknown;
  channel?: unknown;
  createdAt?: unknown;
  packageType?: unknown;
  releaseNotes?: unknown;
  notes?: unknown;
  version?: unknown;
}

interface PackageJson {
  version?: unknown;
}

export type PlatformReleaseInfoReader = () => Promise<PlatformReleaseInfo>;

export function createReleaseInfoReader(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): PlatformReleaseInfoReader {
  let cached: Promise<PlatformReleaseInfo> | null = null;
  return () => {
    cached ??= readReleaseInfo(env, cwd);
    return cached;
  };
}

export async function readReleaseInfo(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): Promise<PlatformReleaseInfo> {
  const [manifest, packageJson] = await Promise.all([
    readJsonFile<ReleaseManifest>(path.join(cwd, 'manifest.json')),
    readJsonFile<PackageJson>(path.join(cwd, 'package.json'))
  ]);
  return {
    buildId: (
      firstString(
        env.APP_BUILD_ID,
        env.RELEASE_BUILD_ID,
        manifest?.buildId,
        env.HEROKU_RELEASE_VERSION,
        env.SOURCE_VERSION
      ) ?? 'local'
    ).slice(0, 80),
    channel: firstString(env.RELEASE_CHANNEL, env.INTRAQ_UPDATER_CHANNEL, manifest?.channel) ?? 'stable',
    commit: firstString(env.SOURCE_VERSION, env.HEROKU_SLUG_COMMIT) ?? null,
    deploymentType: firstString(env.DEPLOYMENT_TYPE) ?? 'self-hosted',
    packageType: firstString(env.RELEASE_PACKAGE_TYPE, manifest?.packageType) ?? 'source',
    releaseNotes: releaseNotesFrom(
      env.APP_RELEASE_NOTES,
      env.RELEASE_NOTES,
      manifest?.releaseNotes,
      manifest?.notes
    ),
    releasedAt: firstString(env.APP_RELEASED_AT, env.RELEASE_CREATED_AT, manifest?.createdAt) ?? null,
    version: firstString(env.APP_VERSION, env.RELEASE_VERSION, manifest?.version, packageJson?.version) ?? '0.0.0'
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function releaseNotesFrom(...values: unknown[]): string[] {
  for (const value of values) {
    const notes = normalizeNotes(value);
    if (notes.length > 0) return notes;
  }
  return [];
}

function normalizeNotes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(isNonEmptyString).map(item => item.trim());
  if (!isNonEmptyString(value)) return [];
  return value
    .split(/\r?\n|\\n|\|/)
    .map(item => item.trim())
    .filter(Boolean);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (isNonEmptyString(value)) return value.trim();
  }
  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
