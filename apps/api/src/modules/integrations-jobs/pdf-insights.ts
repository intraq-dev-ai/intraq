import type { Page } from 'playwright';

export interface PdfInsightSection {
  bullets: string[];
  kind: string;
  summary: string;
  title: string;
}

export async function capturePdfInsightSections(page: Page): Promise<PdfInsightSection[]> {
  return page.evaluate(() => {
    const text = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();
    const textFrom = (root: ParentNode, selector: string): string => text(root.querySelector(selector)?.textContent);
    const textList = (root: ParentNode, selector: string, limit = 4): string[] =>
      Array.from(root.querySelectorAll(selector))
        .map(node => text(node.textContent))
        .filter(Boolean)
        .slice(0, limit);
    const formatNumber = (value: number): string =>
      Number.isFinite(value)
        ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
        : '0';
    const formatList = (values: string[], limit = 4): string => {
      const items = values.filter(Boolean).slice(0, limit);
      if (items.length === 0) return '';
      return values.length > limit ? `${items.join(', ')}, +${values.length - limit} more` : items.join(', ');
    };

    const summarizeCard = (card: Element, title: string): PdfInsightSection => {
      const segmentCards = Array.from(card.querySelectorAll('.dashboard-kpi-segment'));
      if (segmentCards.length > 0) {
        const bullets = segmentCards.slice(0, 3).map(segment => {
          const label = textFrom(segment, 'header span');
          const value = textFrom(segment, 'strong');
          const trend = textFrom(segment, '.dashboard-kpi-segment-meta');
          return [label, value, trend].filter(Boolean).join(' — ');
        }).filter(Boolean);
        if (segmentCards.length > 3) bullets.push(`Additional segments: ${segmentCards.length - 3}`);
        return {
          bullets,
          kind: 'card',
          summary: `Multi-card with ${segmentCards.length} visible segment${segmentCards.length === 1 ? '' : 's'}.`,
          title
        };
      }
      const value = textFrom(card, '.dashboard-kpi-value') || textFrom(card, '[data-kpi-token="value"]');
      const status = textFrom(card, '.dashboard-kpi-status');
      const trend = textFrom(card, '.dashboard-kpi-trend');
      const comparison = textFrom(card, '.dashboard-kpi-token-comparison');
      return {
        bullets: [status, trend, comparison].filter(Boolean),
        kind: 'card',
        summary: value ? `Current KPI value: ${value}.` : 'KPI card rendered successfully.',
        title
      };
    };

    const summarizeTable = (card: Element, title: string): PdfInsightSection => {
      const headers = textList(card, '.dashboard-table-component thead th');
      const tableRows = Array.from(card.querySelectorAll('.dashboard-table-component tbody tr'));
      const groupedRows = tableRows.filter(row => row.classList.contains('is-group'));
      const dataRows = tableRows.filter(row => !row.classList.contains('is-group') && !row.classList.contains('is-group-total'));
      const drill = textFrom(card, '.dashboard-table-drill-banner strong');
      const bullets = [];
      if (headers.length > 0) bullets.push(`Columns: ${formatList(headers)}`);
      if (groupedRows.length > 0) bullets.push(`Grouped rows visible: ${groupedRows.length}`);
      if (drill) bullets.push(`Drill state: ${drill}`);
      return {
        bullets,
        kind: 'table',
        summary: `Table with ${(dataRows.length || tableRows.length)} visible row${(dataRows.length || tableRows.length) === 1 ? '' : 's'} and ${headers.length} column${headers.length === 1 ? '' : 's'}.`,
        title
      };
    };

    const summarizeMatrix = (card: Element, title: string): PdfInsightSection => {
      const rowHeaders = textList(card, '.dashboard-matrix-component tbody th', 6);
      const columnHeaders = textList(card, '.dashboard-matrix-component thead th', 8);
      const bullets = [];
      if (rowHeaders.length > 0) bullets.push(`Rows: ${formatList(rowHeaders)}`);
      if (columnHeaders.length > 0) bullets.push(`Columns: ${formatList(columnHeaders)}`);
      if (card.querySelector('.dashboard-matrix-row-total')) bullets.push('Row totals are visible.');
      if (card.querySelector('.dashboard-matrix-column-group')) bullets.push('Grouped column headers are visible.');
      return {
        bullets,
        kind: 'matrix',
        summary: `Matrix with ${rowHeaders.length} visible row header${rowHeaders.length === 1 ? '' : 's'} and ${columnHeaders.length} visible column header${columnHeaders.length === 1 ? '' : 's'}.`,
        title
      };
    };

    const summarizeChart = (card: Element, title: string): PdfInsightSection => {
      const canvas = card.querySelector('canvas') as (HTMLCanvasElement & { __dashboardChart?: { config?: { type?: string }; data?: { datasets?: Array<{ data?: unknown[]; label?: string }>; labels?: unknown[] } } }) | null;
      const chart = canvas?.__dashboardChart;
      if (chart?.data) {
        const labels = Array.isArray(chart.data.labels)
          ? chart.data.labels.map(value => text(String(value ?? ''))).filter(Boolean)
          : [];
        const datasets = Array.isArray(chart.data.datasets)
          ? chart.data.datasets.map((dataset, index) => ({
              data: Array.isArray(dataset.data)
                ? dataset.data
                  .map(value => Number(value))
                  .filter(value => Number.isFinite(value))
                : [],
              label: text(dataset.label) || `Series ${index + 1}`
            }))
          : [];
        const primary = datasets.find(dataset => dataset.data.length > 0);
        const bullets = [];
        if (datasets.length > 0) bullets.push(`Series: ${formatList(datasets.map(dataset => dataset.label))}`);
        if (labels.length > 1) bullets.push(`Axis range: ${labels[0]} to ${labels.at(-1)}`);
        if (primary && labels.length > 0) {
          let peakValue = Number.NEGATIVE_INFINITY;
          let peakIndex = 0;
          primary.data.forEach((value, index) => {
            if (value > peakValue) {
              peakValue = value;
              peakIndex = index;
            }
          });
          if (Number.isFinite(peakValue)) {
            bullets.push(`${primary.label} peaks at ${formatNumber(peakValue)}${labels[peakIndex] ? ` on ${labels[peakIndex]}` : ''}.`);
          }
        }
        return {
          bullets,
          kind: 'chart',
          summary: `${text(String(chart.config?.type ?? 'chart')).toUpperCase()} chart with ${datasets.length} series across ${labels.length} label${labels.length === 1 ? '' : 's'}.`,
          title
        };
      }
      const fallbackRows = Array.from(card.querySelectorAll('.chart-fallback-table tbody tr'));
      return {
        bullets: fallbackRows.slice(0, 3).map(row => text(row.textContent)).filter(Boolean),
        kind: 'chart',
        summary: `Chart fallback rendered with ${fallbackRows.length} visible data row${fallbackRows.length === 1 ? '' : 's'}.`,
        title
      };
    };

    return Array.from(document.querySelectorAll('.dashboard-canvas-card'))
      .map((card): PdfInsightSection | null => {
        const title = textFrom(card, '.dashboard-element-header h3')
          || text(card.getAttribute('aria-label')).replace(/\s+component$/i, '')
          || 'Untitled component';
        const stateMessage = textFrom(card, '.dashboard-render-state-detail') || textFrom(card, '.dashboard-render-state-title');
        if (stateMessage) {
          return {
            bullets: [],
            kind: 'component',
            summary: stateMessage,
            title
          };
        }
        const kind = text(card.getAttribute('data-component-kind')).toLowerCase();
        if (kind === 'card') return summarizeCard(card, title);
        if (kind === 'table') return summarizeTable(card, title);
        if (kind === 'matrix') return summarizeMatrix(card, title);
        return summarizeChart(card, title);
      })
      .filter((section): section is PdfInsightSection => Boolean(section && section.summary));
  });
}

export function buildPdfIntraqInsightsMarkup(
  dashboardName: string,
  sections: PdfInsightSection[],
  generatedAt = new Date(),
): string {
  const generatedLabel = generatedAt.toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const sectionMarkup = sections
    .map((section) => {
      const bullets = section.bullets
        .filter(Boolean)
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join('');
      return `
        <article class="intraq-section">
          <header class="intraq-section-header">
            <span class="intraq-kind">${escapeHtml(section.kind)}</span>
            <h2>${escapeHtml(section.title)}</h2>
          </header>
          <p class="intraq-summary">${escapeHtml(section.summary)}</p>
          ${bullets ? `<ul class="intraq-bullets">${bullets}</ul>` : ''}
        </article>
      `;
    })
    .join('');
  return `
    <style>
      .intraq-page {
        page-break-before: always;
        break-before: page;
        padding: 32px 36px;
        background: #ffffff;
        color: #0f172a;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .intraq-page * {
        box-sizing: border-box;
      }
      .intraq-header {
        display: grid;
        gap: 8px;
        margin-bottom: 24px;
      }
      .intraq-eyebrow {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #475569;
      }
      .intraq-header h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.1;
      }
      .intraq-meta {
        margin: 0;
        color: #475569;
        font-size: 13px;
      }
      .intraq-sections {
        display: grid;
        gap: 16px;
      }
      .intraq-section {
        border: 1px solid #dbe3ee;
        border-radius: 12px;
        padding: 16px 18px;
        break-inside: avoid;
      }
      .intraq-section-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .intraq-section-header h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.2;
      }
      .intraq-kind {
        border-radius: 999px;
        background: #e2e8f0;
        color: #334155;
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        text-transform: uppercase;
      }
      .intraq-summary {
        margin: 0;
        font-size: 14px;
        line-height: 1.55;
      }
      .intraq-bullets {
        margin: 12px 0 0;
        padding-left: 18px;
        display: grid;
        gap: 6px;
        color: #334155;
        font-size: 13px;
      }
      .intraq-disclaimer {
        margin-top: 20px;
        color: #64748b;
        font-size: 11px;
      }
    </style>
    <header class="intraq-header">
      <span class="intraq-eyebrow">intraQ</span>
      <h1>AI-Generated Dashboard Insights</h1>
      <p class="intraq-meta">${escapeHtml(dashboardName)} · Generated ${escapeHtml(generatedLabel)}</p>
      <p class="intraq-meta">Summaries below are generated from the rendered dashboard state captured in this export.</p>
    </header>
    <section class="intraq-sections">
      ${sectionMarkup}
    </section>
    <p class="intraq-disclaimer">These summaries are intended to support operator review and should be validated against the source dashboard data.</p>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
