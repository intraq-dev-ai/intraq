type JsonBody = object;

export type PdfExportFormat = 'A4' | 'A3' | 'Letter';
export type PdfExportOrientation = 'portrait' | 'landscape';
export type PdfExportQuality = 'low' | 'medium' | 'high';

export type PdfExportOptions = {
  dashboardName?: string;
  format: PdfExportFormat;
  orientation: PdfExportOrientation;
  quality: PdfExportQuality;
  scale: string;
  includeFilters: boolean;
  waitForCharts: boolean;
  includeIntraqInsights: boolean;
  includeTimestamp: boolean;
  includePageNumbers: boolean;
  includeHeader: boolean;
  fileName: string;
  customFilters?: Record<string, string>;
};

type PdfGenerateResult = {
  downloadUrl: string;
  fileName: string;
};

export async function generateDashboardPdf(
  dashboardId: string,
  options: PdfExportOptions
): Promise<PdfGenerateResult> {
  const result = await requestPdfApi<PdfGenerateResult>(
    `/api/pdf-generation/dashboard/${encodeURIComponent(dashboardId)}/generate`,
    {
      method: 'POST',
      body: {
        dashboardName: options.dashboardName,
        fileName: options.fileName,
        format: options.format,
        orientation: options.orientation,
        quality: options.quality,
        scale: options.scale,
        includeFilters: options.includeFilters,
        waitForCharts: options.waitForCharts,
        includeIntraqInsights: options.includeIntraqInsights,
        includeTimestamp: options.includeTimestamp,
        includePageNumbers: options.includePageNumbers,
        includeHeader: options.includeHeader,
        customFilters: options.customFilters
      }
    }
  );
  return result;
}

export async function downloadPdfBlob(downloadUrl: string): Promise<Blob> {
  const response = await fetch(downloadUrl, { headers: { accept: 'application/pdf' } });
  if (!response.ok) throw new Error(`PDF download failed: ${response.statusText}`);
  return response.blob();
}

async function requestPdfApi<TData>(
  path: string,
  options: { method?: string; body?: JsonBody } = {}
): Promise<TData> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const msg = isApiResponse(payload) ? payload.error : `Request to ${path} failed (${response.status})`;
    throw new Error(msg);
  }
  if (isApiResponse(payload)) {
    if (!payload.success) throw new Error(payload.error);
    return payload.data as TData;
  }
  return payload as TData;
}

function isApiResponse(v: unknown): v is { success: boolean; data: unknown; error: string } {
  return typeof v === 'object' && v !== null && 'success' in v;
}
