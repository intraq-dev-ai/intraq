import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readCompatRecord, sendCompatBadRequest, sendCompatJson, sendCompatNotFound } from './compat-http.js';
import type { IntegrationsJobsStore, PdfRecord } from './store.js';
import { decodePart, fixedNow, isNonEmptyString, isRecord, slugify } from './shared.js';
import { pdfGenerationService } from './pdf-generation-service.js';
import { readAuthCookie } from '../auth-setup/auth-cookies.js';
import { readBearerToken } from '../auth-setup/auth-tokens.js';

const validFormats = new Set(['A4', 'A3', 'Letter']);
const validOrientations = new Set(['portrait', 'landscape']);
const validQuality = new Set(['high', 'medium', 'low']);

export class PdfGenerationCompatRoutes {
  constructor(private readonly store: IntegrationsJobsStore) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/pdf-generation/health') {
      this.health(res);
      return true;
    }

    const generateMatch = /^\/api\/pdf-generation\/dashboard\/([^/]+)\/generate$/.exec(url.pathname);
    if (req.method === 'POST' && generateMatch?.[1]) {
      await this.generate(req, res, decodePart(generateMatch[1]));
      return true;
    }

    const downloadMatch = /^\/api\/pdf-generation\/download\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && downloadMatch?.[1]) {
      await this.download(req, res, decodePart(downloadMatch[1]));
      return true;
    }

    return false;
  }

  private health(res: ServerResponse): void {
    sendCompatJson(res, 200, {
      success: true,
      data: {
        chromiumPaths: [{ path: 'playwright-chromium', exists: true }],
        browserLaunch: { success: true, error: null },
        frontendConnectivity: { success: true, error: null }
      }
    });
  }

  private async generate(req: IncomingMessage, res: ServerResponse, dashboardId: string): Promise<void> {
    if (!isNonEmptyString(dashboardId)) {
      sendCompatBadRequest(res, 'dashboardId is required for PDF generation.');
      return;
    }

    const authToken = readBearerToken(req.headers.authorization) ?? readAuthCookie(req);
    if (!authToken) {
      sendCompatJson(res, 401, { success: false, error: 'Authentication required for PDF generation.' });
      return;
    }

    const body = await readCompatRecord(req);
    if (!body) {
      sendCompatBadRequest(res, 'PDF generation body must be a JSON object.');
      return;
    }

    const format = String(body.format ?? 'A4');
    const orientation = String(body.orientation ?? 'portrait');
    const quality = String(body.quality ?? 'medium');

    if (!validFormats.has(format)) {
      sendCompatBadRequest(res, 'format must be A4, A3, or Letter.');
      return;
    }
    if (!validOrientations.has(orientation)) {
      sendCompatBadRequest(res, 'orientation must be portrait or landscape.');
      return;
    }
    if (!validQuality.has(quality)) {
      sendCompatBadRequest(res, 'quality must be high, medium, or low.');
      return;
    }

    try {
      const customFilters = isRecord(body.customFilters) ? (body.customFilters as Record<string, string>) : undefined;
      const scale = normalizePdfScale(body.scale);
      if (scale === null) {
        sendCompatBadRequest(res, 'scale must be a number between 0.5 and 2.');
        return;
      }
      const result = await pdfGenerationService.generate({
        dashboardId,
        authToken,
        ...(isNonEmptyString(body.dashboardName) ? { dashboardName: body.dashboardName.trim() } : {}),
        ...(isNonEmptyString(body.fileName) ? { fileName: body.fileName.trim() } : {}),
        format: format as 'A4' | 'A3' | 'Letter',
        orientation: orientation as 'portrait' | 'landscape',
        quality: quality as 'high' | 'medium' | 'low',
        ...(scale === undefined ? {} : { scale }),
        includeHeader: body.includeHeader !== false,
        includePageNumbers: body.includePageNumbers !== false,
        includeTimestamp: body.includeTimestamp !== false,
        waitForCharts: body.waitForCharts !== false,
        includeIntraqInsights: body.includeIntraqInsights === true,
        ...(customFilters !== undefined ? { customFilters } : {})
      });

      const record: PdfRecord = {
        fileName: result.fileName,
        dashboardId,
        fileSize: result.fileSize,
        createdAt: fixedNow,
        options: {
          format,
          orientation,
          quality,
          ...(scale === undefined ? {} : { scale }),
          includeHeader: body.includeHeader !== false,
          includePageNumbers: body.includePageNumbers !== false,
          includeTimestamp: body.includeTimestamp !== false
        }
      };
      this.store.pdfs.set(result.fileName, record);

      sendCompatJson(res, 200, {
        success: true,
        data: {
          fileName: result.fileName,
          fileSize: result.fileSize,
          downloadUrl: `/api/pdf-generation/download/${result.fileName}`
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed.';
      console.error('[pdf-routes] generate error:', message);
      sendCompatJson(res, 500, { success: false, error: message });
    }
  }

  private async download(req: IncomingMessage, res: ServerResponse, fileName: string): Promise<void> {
    if (!isSafeFileName(fileName)) {
      sendCompatJson(res, 400, { success: false, error: 'Invalid file name' });
      return;
    }

    const record = this.store.pdfs.get(fileName);
    if (!record) {
      sendCompatNotFound(res, 'File not found');
      return;
    }

    const filePath = path.join(process.cwd(), 'generated-pdfs', fileName);
    try {
      const { size } = await stat(filePath);
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': size,
        'content-disposition': `attachment; filename="${fileName}"`,
        'cache-control': 'no-cache'
      });
      createReadStream(filePath).pipe(res);
    } catch {
      sendCompatNotFound(res, 'File not found on disk');
    }
  }
}

function normalizePdfScale(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0.5 || parsed > 2) return null;
  return parsed;
}

function isSafeFileName(fileName: string): boolean {
  return (
    fileName.endsWith('.pdf') &&
    !fileName.includes('..') &&
    !fileName.includes('/') &&
    !fileName.includes('\\')
  );
}
