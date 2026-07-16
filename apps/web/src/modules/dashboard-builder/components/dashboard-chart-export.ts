export type ChartExportAction = 'jpeg' | 'pdf' | 'png' | 'print' | 'svg';

export interface ChartExportMenuItem {
  action: ChartExportAction;
  label: string;
}

export function chartExportActionsForConfig(config: Record<string, unknown> | undefined): ChartExportMenuItem[] {
  const source = config ?? {};
  if (!chartExportMenuEnabled(source)) return [];
  return [
    chartExportActionEnabled(source, 'chartExportPrint', true) ? { action: 'print' as const, label: 'Print chart' } : null,
    chartExportActionEnabled(source, 'chartExportPng', true) ? { action: 'png' as const, label: 'Download PNG image' } : null,
    chartExportActionEnabled(source, 'chartExportJpeg', true) ? { action: 'jpeg' as const, label: 'Download JPEG image' } : null,
    chartExportActionEnabled(source, 'chartExportPdf', true) ? { action: 'pdf' as const, label: 'Download PDF document' } : null,
    chartExportActionEnabled(source, 'chartExportSvg', true) ? { action: 'svg' as const, label: 'Download SVG vector image' } : null
  ].filter((item): item is ChartExportMenuItem => Boolean(item));
}

export function chartExportFileName(base: string): string {
  return base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'chart';
}

export function exportChartCanvas(
  action: ChartExportAction,
  canvas: HTMLCanvasElement,
  options: { filename: string; title: string }
): void {
  if (action === 'print') {
    printChartCanvas(canvas, options);
    return;
  }
  if (action === 'png') {
    downloadBlob(dataUrlToBlob(canvas.toDataURL('image/png')), `${options.filename}.png`);
    return;
  }
  if (action === 'jpeg') {
    downloadBlob(dataUrlToBlob(canvasToImageDataUrl(canvas, 'image/jpeg')), `${options.filename}.jpg`);
    return;
  }
  if (action === 'svg') {
    downloadBlob(chartCanvasSvgBlob(canvas, options.title), `${options.filename}.svg`);
    return;
  }
  if (action === 'pdf') {
    downloadBlob(chartCanvasPdfBlob(canvas), `${options.filename}.pdf`);
  }
}

function chartExportMenuEnabled(config: Record<string, unknown>): boolean {
  return readBooleanConfig(config.showChartExportMenu ?? config.chartExportMenuEnabled ?? config.showChartContextMenu, false);
}

function chartExportActionEnabled(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const aliases: Record<string, string[]> = {
    chartExportJpeg: ['chartExportJPEG', 'downloadJPEG', 'downloadJpeg'],
    chartExportPdf: ['chartExportPDF', 'downloadPDF', 'downloadPdf'],
    chartExportPng: ['chartExportPNG', 'downloadPNG', 'downloadPng'],
    chartExportPrint: ['printChart', 'chartPrint'],
    chartExportSvg: ['chartExportSVG', 'downloadSVG', 'downloadSvg']
  };
  for (const candidate of [key, ...(aliases[key] ?? [])]) {
    const value = readOptionalBooleanConfig(config[candidate]);
    if (value !== undefined) return value;
  }
  return fallback;
}

function readOptionalBooleanConfig(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readBooleanConfig(value: unknown, fallback: boolean): boolean {
  return readOptionalBooleanConfig(value) ?? fallback;
}

function canvasToImageDataUrl(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png'): string {
  if (type === 'image/png') return canvas.toDataURL(type);
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext('2d');
  if (!context) return canvas.toDataURL(type, 0.92);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, copy.width, copy.height);
  context.drawImage(canvas, 0, 0);
  return copy.toDataURL(type, 0.92);
}

function printChartCanvas(canvas: HTMLCanvasElement, options: { filename: string; title: string }): void {
  const image = canvas.toDataURL('image/png');
  const title = escapeHtml(options.title);
  const width = Math.max(canvas.width, 1);
  const height = Math.max(canvas.height, 1);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    downloadBlob(dataUrlToBlob(image), `${options.filename}.png`);
    return;
  }
  printWindow.document.write(`<!doctype html>
<html>
<head>
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 24px; font-family: Arial, sans-serif; }
    img { display: block; max-width: 100%; width: ${width}px; height: auto; }
    @media print { body { padding: 0; } img { width: 100%; } }
  </style>
</head>
<body>
  <img src="${image}" width="${width}" height="${height}" alt="${title}">
  <script>window.onload = function () { window.focus(); window.print(); };<\\/script>
</body>
</html>`);
  printWindow.document.close();
}

function chartCanvasSvgBlob(canvas: HTMLCanvasElement, titleValue: string): Blob {
  const width = Math.max(canvas.width, 1);
  const height = Math.max(canvas.height, 1);
  const image = canvas.toDataURL('image/png');
  const title = escapeXml(titleValue);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${title}</title>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <image href="${image}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

function chartCanvasPdfBlob(canvas: HTMLCanvasElement): Blob {
  const dataUrl = canvasToImageDataUrl(canvas, 'image/jpeg');
  const imageBytes = dataUrlBytes(dataUrl);
  const imageWidth = Math.max(canvas.width, 1);
  const imageHeight = Math.max(canvas.height, 1);
  const margin = 24;
  const pageWidth = Math.max(1, imageWidth * 0.75 + margin * 2);
  const pageHeight = Math.max(1, imageHeight * 0.75 + margin * 2);
  const drawWidth = pageWidth - margin * 2;
  const drawHeight = pageHeight - margin * 2;
  const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${margin} ${margin} cm\n/Im0 Do\nQ\n`;
  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    {
      prefix: `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      bytes: imageBytes,
      suffix: '\nendstream\nendobj\n'
    },
    `5 0 obj\n<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}endstream\nendobj\n`
  ];
  return new Blob(pdfParts(objects), { type: 'application/pdf' });
}

function pdfParts(objects: Array<string | { prefix: string; bytes: Uint8Array; suffix: string }>): BlobPart[] {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets: number[] = [0];
  let offset = 0;
  const add = (part: string | Uint8Array): void => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes as Uint8Array<ArrayBuffer>);
    offset += bytes.length;
  };
  add('%PDF-1.4\n');
  for (const object of objects) {
    offsets.push(offset);
    if (typeof object === 'string') {
      add(object);
    } else {
      add(object.prefix);
      add(object.bytes);
      add(object.suffix);
    }
  }
  const xrefOffset = offset;
  add(`xref\n0 ${objects.length + 1}\n`);
  add('0000000000 65535 f \n');
  for (const objectOffset of offsets.slice(1)) {
    add(`${String(objectOffset).padStart(10, '0')} 00000 n \n`);
  }
  add(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return parts;
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header = '', body = ''] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = window.atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character] ?? character));
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}
