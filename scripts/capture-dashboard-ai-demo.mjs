import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.INTRAQ_DEMO_BASE_URL || 'http://127.0.0.1:4100';
const email = process.env.INTRAQ_DEMO_EMAIL || 'admin@local.intraq.test';
const password = process.env.INTRAQ_DEMO_PASSWORD || 'intraq-demo';
const outputDir = process.env.INTRAQ_DEMO_OUTPUT_DIR || 'docs/assets/demo';
const outputName = process.env.INTRAQ_DEMO_AI_SCREENSHOT || '00-readme-hero-ai-sidebar.png';
const dashboardName = process.env.INTRAQ_DEMO_AI_DASHBOARD_NAME || 'AI Built Sales Dashboard';

await mkdir(outputDir, { recursive: true });

const session = await loginApi();
const source = await sampleSalesSource(session.token);
const table = sampleSalesTable(source);
await deleteExistingDemoDashboards(session.token);
const dashboard = await api(session.token, '/api/dashboards', {
  method: 'POST',
  body: {
    category: 'AI Demo',
    description: 'Created through a Dashboard AI demo conversation.',
    name: dashboardName
  }
});

let conversationId = '';
for (const turn of aiTurns()) {
  const response = await runDashboardAiTurn(session.token, dashboard.id, source, table, turn.prompt, conversationId);
  conversationId = response.conversationId || conversationId;
  for (const element of turn.elements) await createElement(session.token, dashboard.id, source, table, element);
    if (turn.filter) await createLocationFilter(session.token, dashboard.id, source, table);
}
await api(session.token, `/api/dashboards/${encodeURIComponent(dashboard.id)}/publish`, {
  method: 'POST',
  body: {}
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });

try {
  await loginPage(page);
  await page.goto(`${baseUrl}/dashboard/${encodeURIComponent(dashboard.id)}/edit`, { waitUntil: 'networkidle' });
  await page.locator('.dashboard-ai-sidebar').waitFor({ timeout: 30000 });
  await page.getByText('Create a KPI card for total revenue from #Sales.', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('heading', { name: 'Revenue Trend' }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${outputDir}/${outputName}`, fullPage: true });
  console.log(`Dashboard AI demo screenshot written to ${outputDir}/${outputName}`);
} finally {
  await browser.close();
}

async function loginApi() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const payload = await response.json();
  if (!response.ok || !payload?.token) throw new Error(`Login failed with HTTP ${response.status}`);
  return payload;
}

async function loginPage(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });
}

async function api(token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed with HTTP ${response.status}: ${text}`);
  return payload?.data ?? payload?.dashboard ?? payload;
}

async function sampleSalesSource(token) {
  const sources = await api(token, '/api/data-sources/builder-catalog');
  const source = sources.find(item => item.name === 'Sample Sales') ?? sources[0];
  if (!source) throw new Error('Sample Sales data source was not found. Run npm run db:seed first.');
  return source;
}

function sampleSalesTable(source) {
  const table = source.tables?.find(item => item.name === 'sample_sales_model') ?? source.tables?.[0];
  if (!table) throw new Error('Sample Sales model was not found. Run npm run db:seed first.');
  return table;
}

async function deleteExistingDemoDashboards(token) {
  const dashboards = await api(token, '/api/dashboards');
  for (const dashboard of dashboards) {
    if (dashboard.name === dashboardName || dashboard.name === 'AI Generated Sales Demo') {
      await api(token, `/api/dashboards/${encodeURIComponent(dashboard.id)}`, { method: 'DELETE' });
    }
  }
}

async function runDashboardAiTurn(token, dashboardId, source, table, prompt, conversationId) {
  return api(token, '/api/ai/perform-action-v2', {
    method: 'POST',
    body: {
      dashboardId,
      dataSourceId: source.id,
      dataSourceTableId: table.id,
      mode: 'create',
      prompt,
      tableName: table.name,
      ...(conversationId ? { conversationId } : {})
    }
  });
}

async function createElement(token, dashboardId, source, table, element) {
  return api(token, `/api/dashboards/${encodeURIComponent(dashboardId)}/elements`, {
    method: 'POST',
    body: {
      ...element,
      dataSourceId: source.id,
      config: {
        ...baseModelConfig(source, table),
        ...element.config
      }
    }
  });
}

async function createLocationFilter(token, dashboardId, source, table) {
  return api(token, `/api/dashboards/${encodeURIComponent(dashboardId)}/filters`, {
    method: 'POST',
    body: {
      name: 'Location',
      field: 'location',
      operator: 'in',
      value: [],
      type: 'interactive',
      isActive: true,
      order: 0,
      config: {
        dataSourceId: source.id,
        dataSourceTableId: table.id,
        displayMode: 'multi-select',
        label: 'Location',
        placement: 'bar',
        sourceField: 'location',
        tableName: table.name
      }
    }
  });
}

function baseModelConfig(source, table) {
  return {
    dataModelName: table.dictionary?.businessName ?? 'Sales',
    dataSourceId: source.id,
    dataSourceName: source.name,
    dataSourceTableId: table.id,
    fieldFormats: Object.fromEntries(table.fields.map(field => [field.name, field.format ?? defaultFormat(field)])),
    fieldRoles: Object.fromEntries(table.fields.map(field => [field.name, field.role ?? defaultRole(field)])),
    fields: table.fields.map(field => field.name),
    tableName: table.name
  };
}

function defaultFormat(field) {
  if (field.semanticRole === 'currency') return 'currency';
  if (field.type === 'date') return 'date';
  if (field.type === 'number') return 'number';
  return 'text';
}

function defaultRole(field) {
  if (field.role) return field.role;
  return field.type === 'number' ? 'measure' : 'dimension';
}

function aiTurns() {
  return [
    {
      prompt: 'Create a KPI card for total revenue from #Sales.',
      elements: [
        {
          name: 'Total Revenue',
          order: 0,
          type: 'card',
          layout: { x: 0, y: 0, w: 6, h: 3 },
          config: twoRowCardConfig('Total Revenue', 'revenue', 'sum')
        }
      ]
    },
    {
      prompt: 'Add a KPI card for total orders next to revenue.',
      elements: [
        {
          name: 'Total Orders',
          order: 1,
          type: 'card',
          layout: { x: 6, y: 0, w: 6, h: 3 },
          config: twoRowCardConfig('Total Orders', 'orders', 'sum')
        }
      ]
    },
    {
      prompt: 'Add a revenue trend line chart by sale date and compare gross margin.',
      elements: [
        {
          chartType: 'line',
          name: 'Revenue Trend',
          order: 2,
          type: 'chart',
          layout: { x: 0, y: 3, w: 6, h: 7 },
          config: {
            title: 'Revenue Trend',
            xField: 'sale_date',
            ySeries: ['revenue', 'gross_margin'],
            ySeriesSummarize: { gross_margin: 'sum', revenue: 'sum' }
          }
        }
      ]
    },
    {
      filter: true,
      prompt: 'Finish with a sales detail table and a location filter.',
      elements: [
        {
          chartType: 'bar',
          name: 'Revenue by Channel',
          order: 3,
          type: 'chart',
          layout: { x: 6, y: 3, w: 6, h: 7 },
          config: {
            title: 'Revenue by Channel',
            showLegend: false,
            xField: 'channel',
            ySeries: ['revenue'],
            ySeriesSummarize: { revenue: 'sum' }
          }
        },
        {
          name: 'Sales Detail',
          order: 4,
          type: 'table',
          layout: { x: 0, y: 10, w: 12, h: 7 },
          config: {
            title: 'Sales Detail',
            columns: [
              { field: 'location', label: 'Location' },
              { field: 'category', label: 'Category' },
              { field: 'channel', label: 'Channel' },
              { aggregation: 'sum', field: 'orders', format: 'number', label: 'Orders' },
              { aggregation: 'sum', field: 'revenue', format: 'currency', label: 'Revenue' },
              { aggregation: 'sum', field: 'gross_margin', format: 'currency', label: 'Gross Margin' }
            ],
            rowLimit: 25
          }
        }
      ]
    }
  ];
}

function twoRowCardConfig(title, valueField, aggregationType) {
  return {
    aggregationType,
    bottomRowContent: ['value'],
    layoutMode: 'two-row',
    rowHeightRatio: '0.85fr 1.15fr',
    showIndicator: false,
    showTrend: false,
    title,
    topRowContent: ['title'],
    valueField,
    valueFontSize: '24px'
  };
}
