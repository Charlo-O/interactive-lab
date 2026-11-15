import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';
import { projects, basePath } from './projects.mjs';
import { createServer } from './serve.mjs';

const out = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'interactive-lab-smoke');
await mkdir(out, { recursive: true });
const browserPaths = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let executablePath;
for (const candidate of browserPaths) { try { await access(candidate); executablePath = candidate; break; } catch {} }
if (!executablePath) throw new Error('Set CHROME_PATH to a Chrome/Chromium executable');
let server;
let url = process.env.SMOKE_URL;
if (!url) {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}${basePath()}`;
}
url = url.replace(/\/?$/, '/');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const report = [];
const selectedProjects = process.env.SMOKE_PROJECTS?.split(',');
const selectedModes = process.env.SMOKE_MODES?.split(',');
async function settle(page, ms = 400) { await page.waitForTimeout(ms); }
// Capture the current frame without blocking on an optional external font service.
async function capture(page, file) {
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await writeFile(file, Buffer.from(data, 'base64'));
  } finally { await session.detach(); }
}
async function initPage(context, route) {
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(url).origin) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  const response = await page.goto(new URL(route, url).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.equal(response.status(), 200);
  return { page, errors };
}

try {
  for (const [mode, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    if (selectedModes && !selectedModes.includes(mode)) continue;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mode === 'mobile', hasTouch: mode === 'mobile', reducedMotion: 'reduce' });
    const home = await initPage(context, './');
    assert.equal(await home.page.locator('a.card').count(), 8);
    assert.ok(await home.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${mode} home overflows horizontally`);
    await capture(home.page, path.join(out, `${mode}-home.png`));
    assert.deepEqual(home.errors, []);
    await home.page.close();
    for (const project of projects) {
      if (selectedProjects && !selectedProjects.includes(project.slug)) continue;
      const { page, errors } = await initPage(context, `${project.slug}/`);
      try {
        await page.locator('#lab-navigation').waitFor();
        if (project.slug === 'ripples') {
          await page.locator('#sheet').fill('今天，写一点会泛起涟漪的字。');
          assert.match(await page.locator('#sheet').innerText(), /泛起涟漪/);
          if (mode === 'mobile') await page.locator('#papers .chip').nth(1).tap();
          else await page.locator('#papers .chip').nth(1).click();
          await page.waitForFunction(() => document.querySelectorAll('#papers .chip')[1].getAttribute('aria-pressed') === 'true');
          assert.equal(await page.locator('#papers .chip').nth(1).getAttribute('aria-pressed'), 'true');
          await page.locator('#fresh').click();
          await settle(page, 700);
        } else if (project.slug === 'letter') {
          await page.waitForFunction(() => document.querySelector('#stage').dataset.state === 'sealed');
          await page.locator('#envFront').click();
          await page.waitForFunction(() => document.querySelector('#stage').dataset.state === 'open');
          await page.locator('#nextBtn').click();
          await settle(page, 700);
          assert.equal(await page.locator('#prevBtn').isDisabled(), false);
        } else if (project.slug === 'watercat') {
          await page.locator('#panel-summary').filter({ hasText: '脊柱' }).waitFor({ state: 'attached' });
          await page.locator('[data-action="fog"]').click();
          assert.equal(await page.locator('[data-action="fog"]').getAttribute('aria-pressed'), 'true');
          await page.locator('[data-view="structure"]').click();
          assert.equal(await page.locator('#viewport').getAttribute('data-view'), 'structure');
          await page.locator('[data-view="final"]').click();
          await settle(page, 800);
        } else if (project.slug === 'architecture') {
          for (const id of ['zhaozhou', 'tulou', 'xuankong', 'yingxian', 'tiantan']) {
            await page.locator(`[data-m="${id}"]`).click();
            assert.equal(new URL(page.url()).hash, `#${id}`);
          }
          await page.locator('#prog').evaluate(el => { el.value = el.max; el.dispatchEvent(new Event('input', { bubbles: true })); });
          await page.locator('#bSect').click();
          assert.equal(await page.locator('#cut').inputValue(), '100');
          await page.locator('#bReset').click();
          assert.equal(await page.locator('#cut').inputValue(), '0');
          await settle(page);
        } else if (project.slug === 'glass-wheel') {
          const before = await page.locator('#readout').innerText();
          await page.locator('#phone').hover();
          await page.keyboard.press('ArrowDown');
          await settle(page, 700);
          assert.notEqual(await page.locator('#readout').innerText(), before);
          const label = await page.locator('#play').innerText();
          await page.locator('#play').click();
          assert.notEqual(await page.locator('#play').innerText(), label);
        } else if (project.slug === 'whole-circle') {
          await page.waitForFunction(() => document.querySelector('#stage').width > 0);
          await settle(page, 2000);
          await page.locator('#stage').focus();
          await page.keyboard.press('ArrowRight');
          await page.keyboard.down('Space');
          await settle(page, 350);
          assert.ok(await page.locator('#cursor').evaluate(el => el.classList.contains('down')));
          await page.keyboard.up('Space');
        } else if (project.slug === 'dither-motion') {
          assert.equal(await page.evaluate(() => typeof Mp4Muxer.Muxer), 'function');
          await page.locator('#creature').selectOption('turtle');
          assert.equal(await page.locator('#creature').inputValue(), 'turtle');
          await page.locator('#creature').selectOption('lizard');
          await page.locator('#toggleFrame').click();
          assert.equal(await page.locator('#toggleFrame').getAttribute('aria-pressed'), 'false');
          await page.locator('#creature').selectOption('koi');
          await settle(page);
        } else if (project.slug === 'autumn') {
          await page.waitForFunction(() => document.querySelectorAll('img').length > 20 && [...document.images].every(img => img.complete && img.naturalWidth > 0));
          await page.mouse.click(viewport.width * .55, viewport.height * .45);
          assert.equal(await page.evaluate(() => window.AUTUMN.phase), 'out');
          await settle(page, 600);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${project.slug} ${mode} overflows horizontally`);
        await capture(page, path.join(out, `${mode}-${project.slug}.png`));
        const homeLink = await page.locator('#lab-navigation').getByRole('link', { name: '返回交互实验室', exact: true }).getAttribute('href');
        assert.equal(new URL(homeLink, page.url()).pathname, new URL(url).pathname);
        const videoLink = await page.locator('#lab-navigation').getByRole('link', { name: '观看演示视频', exact: true }).getAttribute('href');
        assert.equal(videoLink, `https://charlo.cn/video-library/videos/${project.slug}/`);
        assert.deepEqual(errors, [], `${project.slug}: browser errors`);
        report.push({ project: project.slug, mode, status: 'passed' });
        console.log(`PASS ${mode} ${project.slug}`);
      } catch (error) {
        await capture(page, path.join(out, `${mode}-${project.slug}-failed.png`)).catch(() => {});
        report.push({ project: project.slug, mode, status: 'failed', error: error.message, browserErrors: errors });
        throw error;
      } finally { await page.close(); }
    }
    await context.close();
  }
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ url, report }, null, 2));
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
console.log(`All selected interactions passed. Screenshots: ${out}`);
