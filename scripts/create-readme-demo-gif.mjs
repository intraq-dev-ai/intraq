import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputImage = path.join(rootDir, 'docs/assets/demo/00-readme-hero-ai-sidebar.png');
const outputGif = path.join(rootDir, 'docs/assets/demo/00-readme-ai-dashboard-flow.gif');
const inputImageDataUrl = `data:image/png;base64,${(await readFile(inputImage)).toString('base64')}`;

const frames = [
  {
    eyebrow: 'Step 1',
    title: 'Ask in plain English',
    body: 'Create a revenue dashboard from Sample Sales.',
    progress: '25%'
  },
  {
    eyebrow: 'Step 2',
    title: 'AI plans the dashboard',
    body: 'IntraQ uses metadata, models, and dashboard context before it builds.',
    progress: '50%'
  },
  {
    eyebrow: 'Step 3',
    title: 'Generate trusted SQL-backed charts',
    body: 'Charts are saved as live dashboard elements, not static screenshots.',
    progress: '75%'
  },
  {
    eyebrow: 'Step 4',
    title: 'Inspect, reuse, and publish',
    body: 'The AI sidebar keeps the workflow visible while the dashboard remains editable.',
    progress: '100%'
  }
];

const tempDir = await mkdtemp(path.join(tmpdir(), 'intraq-readme-gif-'));
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });

  for (const [index, frame] of frames.entries()) {
    await page.setContent(renderFrame(frame), { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(tempDir, `frame-${String(index).padStart(2, '0')}.png`) });
  }

  await execFileAsync('/opt/homebrew/bin/ffmpeg', [
    '-y',
    '-framerate',
    '0.8',
    '-i',
    path.join(tempDir, 'frame-%02d.png'),
    '-vf',
    'scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5',
    '-loop',
    '0',
    outputGif
  ]);

  console.log(`README demo GIF written to ${path.relative(rootDir, outputGif)}`);
} finally {
  await browser.close();
  await rm(tempDir, { force: true, recursive: true });
}

function renderFrame(frame) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        width: 960px;
        height: 540px;
        overflow: hidden;
        background: #07111f;
        color: #fff;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .stage {
        position: relative;
        width: 960px;
        height: 540px;
        background-image:
          linear-gradient(90deg, rgba(7, 17, 31, 0.2), rgba(7, 17, 31, 0.04)),
          url("${inputImageDataUrl}");
        background-size: cover;
        background-position: top left;
      }
      .panel {
        position: absolute;
        left: 28px;
        right: 28px;
        bottom: 24px;
        min-height: 136px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 24px;
        background: rgba(8, 17, 31, 0.9);
        box-shadow: 0 24px 90px rgba(2, 6, 23, 0.45);
        padding: 24px 28px;
      }
      .eyebrow {
        color: #67e8f9;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 0.11em;
        line-height: 1;
        margin-bottom: 12px;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: 34px;
        line-height: 1.04;
        letter-spacing: -0.04em;
      }
      p {
        margin: 12px 0 0;
        max-width: 760px;
        color: #d7e3f4;
        font-size: 20px;
        line-height: 1.32;
      }
      .progress {
        position: absolute;
        right: 28px;
        top: 28px;
        width: 148px;
        height: 12px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.22);
      }
      .progress::before {
        content: "";
        display: block;
        width: ${frame.progress};
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #38bdf8, #22c55e);
      }
      .badge {
        position: absolute;
        top: 24px;
        left: 28px;
        border: 1px solid rgba(103, 232, 249, 0.32);
        border-radius: 999px;
        background: rgba(8, 17, 31, 0.78);
        color: #e0f2fe;
        font-size: 15px;
        font-weight: 700;
        padding: 10px 14px;
      }
    </style>
  </head>
  <body>
    <main class="stage">
      <div class="badge">IntraQ AI Dashboard Builder</div>
      <section class="panel">
        <div class="progress" aria-hidden="true"></div>
        <div class="eyebrow">${escapeHtml(frame.eyebrow)}</div>
        <h1>${escapeHtml(frame.title)}</h1>
        <p>${escapeHtml(frame.body)}</p>
      </section>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
