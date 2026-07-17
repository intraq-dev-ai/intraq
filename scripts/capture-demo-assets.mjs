import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.INTRAQ_DEMO_BASE_URL || 'http://127.0.0.1:4100';
const email = process.env.INTRAQ_DEMO_EMAIL || 'admin@local.intraq.test';
const password = process.env.INTRAQ_DEMO_PASSWORD || 'intraq-demo';
const outputDir = process.env.INTRAQ_DEMO_OUTPUT_DIR || 'docs/assets/demo';

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });

try {
  await login(page);
  await screenshot(page, '/dashboard', '01-dashboard-list.png');
  const dashboardId = await starterDashboardId(page);
  await openStarterDashboard(page, dashboardId);
  await screenshotCurrent(page, '02-sample-sales-overview.png');
  await screenshotBuilderHero(page, dashboardId);
  await screenshotDataSources(page);
  await screenshot(page, '/admin/ai-api-key-management', '04-ai-provider-settings.png');
  console.log(`Demo screenshots written to ${outputDir}`);
} finally {
  await browser.close();
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });
}

async function screenshot(page, path, name) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${outputDir}/${name}`, fullPage: true });
}

async function screenshotCurrent(page, name) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${outputDir}/${name}`, fullPage: true });
}

async function screenshotDataSources(page) {
  await page.goto(`${baseUrl}/admin/data-sources`, { waitUntil: 'networkidle' });
  const sampleData = page.getByText('Sample Data', { exact: true });
  if (await sampleData.count()) await sampleData.click();
  await page.screenshot({ path: `${outputDir}/03-data-sources.png`, fullPage: true });
}

async function starterDashboardId(page) {
  const dashboardId = await page.evaluate(async () => {
    const token = window.localStorage.getItem('auth_token') || window.localStorage.getItem('token') || '';
    const response = await fetch('/api/dashboards', {
      headers: token ? { authorization: `Bearer ${token}` } : {}
    });
    const payload = await response.json();
    const dashboards = Array.isArray(payload?.data) ? payload.data : [];
    return dashboards.find(item => item?.name === 'Sample Sales Overview')?.id ?? '';
  });
  if (!dashboardId) throw new Error('Sample Sales Overview dashboard was not found. Run npm run db:seed first.');
  return dashboardId;
}

async function openStarterDashboard(page, dashboardId) {
  await page.goto(`${baseUrl}/dashboard/${encodeURIComponent(dashboardId)}`, { waitUntil: 'networkidle' });
  await page.getByText('Total Revenue', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('heading', { name: 'Revenue Trend' }).waitFor({ timeout: 30000 });
}

async function screenshotBuilderHero(page, dashboardId) {
  await page.goto(`${baseUrl}/dashboard/${encodeURIComponent(dashboardId)}/edit`, { waitUntil: 'networkidle' });
  await page.locator('.dashboard-ai-sidebar').waitFor({ timeout: 30000 });
  await page.getByLabel('AI dashboard builder').waitFor({ timeout: 30000 });
  await page.getByRole('heading', { name: 'Revenue Trend' }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${outputDir}/00-readme-hero-ai-sidebar.png`, fullPage: true });
}
