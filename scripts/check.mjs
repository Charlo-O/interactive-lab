import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { projects, basePath } from './projects.mjs';

const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const base = basePath();
const failures = [];
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await walk(full);
    else files.push(full);
  }
}
await walk(dist);
const home = await readFile(path.join(dist, 'index.html'), 'utf8');
assert.equal((home.match(/class="card"/g) || []).length, projects.length, 'Homepage must link all experiments');

async function verifyReference(file, raw) {
  const ref = raw.replace(/&amp;/g, '&');
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/\/)/i.test(ref) || !ref) return;
  let value = ref.split(/[?#]/)[0];
  if (!value) return;
  try { value = decodeURIComponent(value); } catch { return; }
  if (value.startsWith('#')) return;
  let target;
  if (value.startsWith('/')) {
    if (!value.startsWith(base)) { failures.push(`${path.relative(dist, file)} uses a path outside ${base}: ${ref}`); return; }
    target = path.join(dist, value.slice(base.length));
  } else target = path.resolve(path.dirname(file), value);
  if (!target.startsWith(dist + path.sep) && target !== dist) {
    failures.push(`${path.relative(dist, file)} points outside the site: ${ref}`); return;
  }
  try {
    if ((await stat(target)).isDirectory()) await stat(path.join(target, 'index.html'));
  } catch { failures.push(`${path.relative(dist, file)} → missing ${ref}`); }
}

for (const file of files) {
  if (file.endsWith('.js')) {
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
    catch { failures.push(`JavaScript syntax error: ${path.relative(dist, file)}`); }
  }
  if (/\.(mp4|mov|zip|blend|psd|ttf)$/i.test(file)) failures.push(`Unexpected production/source material: ${path.relative(dist, file)}`);
  if (file.endsWith('.html')) {
    const text = await readFile(file, 'utf8');
    for (const tag of text.matchAll(/<(?:script|link|a|img|source|iframe|use|image)\b[^>]*>/gi)) {
      for (const ref of tag[0].matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) await verifyReference(file, ref[1]);
    }
  }
  if (file.endsWith('.css')) {
    const text = await readFile(file, 'utf8');
    for (const ref of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) await verifyReference(file, ref[1]);
  }
}
for (const project of projects) {
  const entry = path.join(dist, project.slug, 'index.html');
  assert.ok((await stat(entry)).isFile(), `${project.slug} entry missing`);
  assert.ok((await readFile(entry, 'utf8')).includes('data-piece='), `${project.slug} home navigation missing`);
  assert.ok(home.includes(`href="./${project.slug}/"`), `${project.slug} homepage link missing`);
}
const sprites = await readFile(path.join(dist, 'autumn/js/sprites.js'), 'utf8');
for (const ref of sprites.matchAll(/src: '([^']+)'/g)) await verifyReference(path.join(dist, 'autumn/index.html'), ref[1]);
const letter = await readFile(path.join(dist, 'letter/index.html'), 'utf8');
assert.ok(!letter.includes('href="/favicon.svg"'), 'Letter favicon must use the project base path');
assert.ok(!letter.includes('href="/"'), 'Letter links must remain within the lab');
assert.ok(!(await readFile(path.join(dist, 'dither-motion/index.html'), 'utf8')).includes('cdn.jsdelivr.net'), 'Video export dependency must be served locally');
if (failures.length) throw new Error(failures.join('\n'));
const bytes = (await Promise.all(files.map(async file => (await stat(file)).size))).reduce((a, b) => a + b, 0);
console.log(`Checked ${projects.length} pages, ${files.length} published files, ${(bytes / 1024 / 1024).toFixed(2)} MiB; local links are valid.`);
