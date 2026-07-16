import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { slugify } from './shared.js';
import {
  buildPdfIntraqInsightsMarkup,
  capturePdfInsightSections,
  type PdfInsightSection
} from './pdf-insights.js';

export {
  buildPdfIntraqInsightsMarkup,
  type PdfInsightSection
} from './pdf-insights.js';

export interface PdfGenerateOptions {
  dashboardId: string;
  authToken: string;
  dashboardName?: string;
  fileName?: string;
  format?: 'A4' | 'A3' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  quality?: 'high' | 'medium' | 'low';
  scale?: number;
  includeTimestamp?: boolean;
  includePageNumbers?: boolean;
  includeHeader?: boolean;
  waitForCharts?: boolean;
  includeIntraqInsights?: boolean;
  customFilters?: Record<string, string>;
}

export interface PdfGenerateResult {
  filePath: string;
  fileName: string;
  fileSize: number;
}

const FRONTEND_URL = process.env.FRONTEND_URL ?? process.env.WEB_ORIGIN ?? 'http://localhost:5175';
const OUTPUT_DIR = path.join(process.cwd(), 'generated-pdfs');

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

class PdfGenerationService {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    const { chromium } = await import('playwright').catch((error: unknown) => {
      const err = new Error('PDF generation requires Playwright to be installed in the production runtime.');
      (err as Error & { cause?: unknown }).cause = error;
      throw err;
    });
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--ignore-certificate-errors',
        '--window-size=1920,1080'
      ]
    });
    return this.browser;
  }

  async generate(options: PdfGenerateOptions): Promise<PdfGenerateResult> {
    await ensureDir(OUTPUT_DIR);

    const format = options.format ?? 'A4';
    const orientation = options.orientation ?? 'portrait';
    const quality = options.quality ?? 'medium';
    const scale = normalizedPdfScale(options.scale, quality);

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: quality === 'high' ? 2 : 1
      });

      page = await context.newPage();
      await page.emulateMedia({ media: 'screen' });
      page.setDefaultTimeout(60_000);
      page.setDefaultNavigationTimeout(60_000);

      // Seed localStorage so the frontend's authenticated-fetch picks up the token
      await page.goto(`${FRONTEND_URL}?pdf=true`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.evaluate((token) => {
        localStorage.setItem('accessToken', token);
        localStorage.setItem('auth_token', token);
        localStorage.setItem('token', token);
      }, options.authToken);
      await sleep(300);

      // Build URL — encode custom filters as base64 query param (mirrors legacy pattern)
      const filtersQuery = options.customFilters && Object.keys(options.customFilters).length
        ? `&pdfFilters=${encodeURIComponent(Buffer.from(JSON.stringify(options.customFilters)).toString('base64'))}`
        : '';
      const dashboardUrl = `${FRONTEND_URL}/dashboard/${options.dashboardId}?pdf=true${filtersQuery}`;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.goto(dashboardUrl, { waitUntil: 'networkidle', timeout: 60_000 });
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await sleep(1200);
        }
      }

      await page.waitForSelector('body', { timeout: 15_000 });
      await sleep(500);

      // Reflow the page for PDF: strip all fixed heights / overflow clips up the tree
      await page.addStyleTag({
        content: `
          html, body, #app {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: unset !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Both shell containers clip to 100vh — remove that */
          .dashboard-builder-page,
          .dashboard-main {
            height: auto !important;
            min-height: unset !important;
            overflow: visible !important;
          }

          /* Keep flex on the page so children lay out correctly,
             but let it grow beyond one viewport */
          .dashboard-builder-page {
            display: flex !important;
            flex-direction: row !important;
          }

          .dashboard-main {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            min-width: 0 !important;
          }

          /* Hide sidebar, topbar, action bars, dialogs */
          .dashboard-list-panel,
          .dashboard-sidebar-menu,
          .dashboard-topbar,
          .dashboard-workspace-header,
          .dashboard-topbar-actions,
          .dashboard-mobile-actions,
          .dashboard-mobile-export-menu,
          .dashboard-analyzer-panel,
          .dashboard-workspace-sidebar,
          .dashboard-run-settings-modal,
          .builder-conversation,
          .builder-sidebar {
            display: none !important;
          }

          .dashboard-content,
          .dashboard-canvas-area {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            flex: 1 !important;
          }

          /* IMPORTANT: do NOT set height: auto on .vue-grid-layout —
             the library sets an explicit pixel height for its absolutely-
             positioned children. Only remove the overflow clip. */
          .vue-grid-layout {
            overflow: visible !important;
          }
          .vue-grid-item {
            break-inside: avoid !important;
            box-shadow: none !important;
          }

          /* Expand tables to show all rows */
          .dashboard-table-wrapper,
          .dashboard-table-scroll {
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
          }

          canvas, svg { background: transparent !important; }
        `
      });

      await sleep(300);

      // Wait for chart canvases to finish rendering
      if (options.waitForCharts !== false) {
        // Try the app-level ready signal first
        const readyBySignal = await page.waitForFunction(
          'window.__chartsReady === true',
          { timeout: 15_000 }
        ).then(() => true).catch(() => false);

        if (!readyBySignal) {
          // Fallback: wait until all canvases have non-zero dimensions
          await page.waitForSelector('canvas', { timeout: 20_000 }).catch(() => {});
          await page.evaluate(async () => {
            window.dispatchEvent(new Event('resize'));
            await new Promise(r => setTimeout(r, 400));
            const w = window as unknown as Record<string, unknown>;
            const Chart = w['Chart'] as { instances?: unknown } | undefined;
            if (Chart?.instances) {
              const insts: Array<{ resize?: () => void; update?: () => void }> = [];
              if (typeof (Chart.instances as { forEach?: unknown }).forEach === 'function') {
                (Chart.instances as { forEach: (cb: (v: unknown) => void) => void }).forEach(v => insts.push(v as never));
              } else {
                insts.push(...Object.values(Chart.instances as object) as never[]);
              }
              insts.forEach(inst => { try { inst.resize?.(); inst.update?.(); } catch {} });
            }
          });
          await page.waitForFunction(() => {
            const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
            return canvases.length === 0 || canvases.every(c => c.offsetWidth > 0 && c.width > 0);
          }, { timeout: 25_000 }).catch(() => {});
        }
      }

      if (options.includeIntraqInsights) {
        const insightSections = await capturePdfInsightSections(page);
        if (insightSections.length > 0) {
          const intraqInsightsMarkup = buildPdfIntraqInsightsMarkup(
            options.dashboardName?.trim() || options.dashboardId,
            insightSections
          );
          await page.evaluate((markup) => {
            document.getElementById('intraq-pdf-page')?.remove();
            const pageSection = document.createElement('section');
            pageSection.id = 'intraq-pdf-page';
            pageSection.className = 'intraq-page';
            pageSection.innerHTML = markup;
            document.body.appendChild(pageSection);
          }, intraqInsightsMarkup);
          await sleep(250);
        }
      }

      // Allow a frame for the overflow changes to reflow
      await sleep(300);

      // Measure full dashboard content dimensions
      const dims = await page.evaluate(() => {
        const grid = document.querySelector<HTMLElement>('.vue-grid-layout');
        const content = document.querySelector<HTMLElement>('.dashboard-content')
          ?? document.querySelector<HTMLElement>('.dashboard-canvas-area')
          ?? document.body as HTMLElement;

        // vue-grid-layout sets an explicit pixel height on the container for its
        // absolutely-positioned items — read that directly instead of scrollHeight.
        const gridRect = grid ? grid.getBoundingClientRect() : null;
        const gridLibraryHeight = grid ? parseFloat(grid.style.height || '0') : 0;
        const gridOffsetTop = gridRect ? gridRect.top + window.scrollY : 0;
        const gridBottom = gridOffsetTop + Math.max(gridLibraryHeight, grid?.scrollHeight ?? 0);

        // Fallback: walk items for tables that may expand beyond the library height
        const items = Array.from(document.querySelectorAll<HTMLElement>('.vue-grid-item'));
        let maxItemBottom = 0;
        items.forEach(el => {
          const r = el.getBoundingClientRect();
          const base = r.bottom + window.scrollY;
          const extra = el.querySelector('table, .dashboard-table') ? el.scrollHeight - el.clientHeight : 0;
          maxItemBottom = Math.max(maxItemBottom, base + extra);
        });

        const contentRect = content.getBoundingClientRect();
        const contentTop = contentRect.top + window.scrollY;

        const fullHeight = Math.max(gridBottom, maxItemBottom, contentTop + content.scrollHeight) + 60;
        const fullWidth = Math.max(document.documentElement.scrollWidth, content.scrollWidth, 1200);

        return { fullWidth: Math.ceil(fullWidth), fullHeight: Math.ceil(fullHeight) };
      });

      await page.evaluate(() => { window.scrollTo(0, 0); });
      await sleep(200);

      const timestamp = Date.now();
      const fileName = sanitizePdfFileName(options.fileName, options.dashboardName ?? options.dashboardId, timestamp);
      const filePath = path.join(OUTPUT_DIR, fileName);
      const headerFooter = buildPdfHeaderFooterOptions(options);

      await page.pdf({
        path: filePath,
        printBackground: true,
        preferCSSPageSize: false,
        width: `${dims.fullWidth}px`,
        height: `${dims.fullHeight}px`,
        margin: headerFooter.displayHeaderFooter
          ? { top: '44px', right: '20px', bottom: '36px', left: '10px' }
          : { top: '10px', right: '20px', bottom: '10px', left: '10px' },
        scale,
        ...headerFooter
      });

      const { size: fileSize } = await stat(filePath);
      return { filePath, fileName, fileSize };
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }

  async cleanup(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(OUTPUT_DIR);
      const cutoff = Date.now() - maxAgeMs;
      await Promise.all(files.map(async file => {
        const filePath = path.join(OUTPUT_DIR, file);
        const { mtimeMs } = await stat(filePath).catch(() => ({ mtimeMs: Date.now() }));
        if (mtimeMs < cutoff) await unlink(filePath).catch(() => {});
      }));
    } catch {}
  }

  async destroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true }).catch(() => {});
}

export const pdfGenerationService = new PdfGenerationService();

function normalizedPdfScale(value: number | undefined, quality: PdfGenerateOptions['quality']): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.min(2, Math.max(0.5, value));
  return quality === 'high' ? 1 : quality === 'medium' ? 0.85 : 0.7;
}

function sanitizePdfFileName(
  requested: string | undefined,
  fallbackLabel: string,
  timestamp: number
): string {
  const normalized = (requested ?? '').trim().replace(/\.pdf$/i, '');
  const safeBase = normalized
    .replace(/[\\/]+/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/[^a-z0-9._ -]+/gi, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[-_. ]+|[-_. ]+$/g, '');
  if (safeBase) return `${safeBase}.pdf`;
  return `dashboard-${slugify(fallbackLabel)}-${timestamp}.pdf`;
}

function buildPdfHeaderFooterOptions(options: PdfGenerateOptions): {
  displayHeaderFooter?: boolean;
  footerTemplate?: string;
  headerTemplate?: string;
} {
  const includeHeader = options.includeHeader !== false;
  const includeTimestamp = options.includeTimestamp !== false;
  const includePageNumbers = options.includePageNumbers !== false;
  if (!includeHeader && !includeTimestamp && !includePageNumbers) return {};
  const title = escapeHtml(options.dashboardName?.trim() || options.dashboardId);
  const headerTemplate = includeHeader
    ? `<div style="width:100%;font-size:9px;padding:0 20px;color:#475569;display:flex;align-items:center;justify-content:space-between;">
         <span style="font-weight:600;">${title}</span>
         <span></span>
       </div>`
    : '<div></div>';
  const footerParts = [
    includeTimestamp
      ? '<span class="date"></span>'
      : '<span></span>',
    includePageNumbers
      ? '<span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>'
      : '<span></span>'
  ];
  const footerTemplate = `<div style="width:100%;font-size:9px;padding:0 20px;color:#64748b;display:flex;align-items:center;justify-content:space-between;">${footerParts.join('')}</div>`;
  return {
    displayHeaderFooter: true,
    footerTemplate,
    headerTemplate
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
