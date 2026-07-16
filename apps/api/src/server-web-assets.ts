import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { sendNotFound } from './http.js';
import type { PlatformFoundationRoutes } from './modules/platform/foundation-routes.js';
import type { PublicAccessFoundationRoutes } from './modules/public-access/foundation-routes.js';
import { injectWebShareMetadata } from './web-share-metadata.js';

export async function serveWebAsset(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  staticWebDir: string,
  platformFoundationRoutes: PlatformFoundationRoutes,
  publicAccessFoundationRoutes: PublicAccessFoundationRoutes
): Promise<void> {
  if (req.method !== 'GET') {
    sendNotFound(res);
    return;
  }

  const filePath = await resolveWebAsset(url.pathname, staticWebDir);
  if (!filePath) {
    sendNotFound(res);
    return;
  }

  const fileBody = await readFile(filePath);
  const body = await webAssetBody(filePath, fileBody, req, url, platformFoundationRoutes);
  const headers: Record<string, string | number> = {
    'content-type': contentTypeFor(filePath),
    'content-length': body.byteLength
  };
  const frameAncestors = publicAccessFoundationRoutes.frameAncestorsForEmbedRoute(url);
  if (frameAncestors) headers['content-security-policy'] = frameAncestors;
  res.writeHead(200, headers);
  res.end(body);
}

async function webAssetBody(
  filePath: string,
  body: Buffer,
  req: IncomingMessage,
  url: URL,
  platformFoundationRoutes: PlatformFoundationRoutes
): Promise<Buffer> {
  if (!filePath.endsWith('index.html')) return body;
  try {
    const branding = await platformFoundationRoutes.readBrandingForRequest(req);
    return Buffer.from(injectWebShareMetadata(body.toString('utf8'), { branding, requestUrl: url }), 'utf8');
  } catch (error) {
    console.error('Failed to apply web share branding', error);
    return body;
  }
}

async function resolveWebAsset(requestPath: string, staticWebDir: string): Promise<string | null> {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const candidate = path.join(staticWebDir, safePath);
  const root = path.resolve(staticWebDir);
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(root)) return null;

  try {
    const result = await stat(resolved);
    if (result.isFile()) return resolved;
  } catch {
    return path.join(root, 'index.html');
  }

  return path.join(root, 'index.html');
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}
