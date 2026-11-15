import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build as bundle } from 'esbuild';
import { build as buildAstro } from 'astro';
import { projects, basePath } from './projects.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);
const base = basePath();
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'site'), dist, { recursive: true });

for (const { slug } of projects.filter(project => !['letter', 'watercat'].includes(project.slug))) {
  await cp(path.join(root, 'projects', slug), path.join(dist, slug), {
    recursive: true,
    filter: source => !source.endsWith('.md') && path.basename(source) !== '.DS_Store',
  });
}

await buildAstro({
  root: path.join(root, 'projects/letter'),
  base: `${base}letter/`,
  outDir: path.join(dist, 'letter'),
  cacheDir: path.join(root, 'node_modules/.astro-letter'),
  logLevel: 'warn',
});

const catSource = path.join(root, 'projects/watercat');
const catOut = path.join(dist, 'watercat');
await mkdir(catOut, { recursive: true });
await bundle({
  entryPoints: [path.join(catSource, 'src/main.js')],
  outfile: path.join(catOut, 'app.js'),
  bundle: true,
  format: 'iife',
  minify: true,
  legalComments: 'eof',
  loader: { '.mp3': 'dataurl' },
});
await cp(path.join(catSource, 'src/style.css'), path.join(catOut, 'style.css'));
await cp(path.join(catSource, 'assets'), path.join(catOut, 'assets'), { recursive: true });
const catHTML = (await readFile(path.join(catSource, 'src/page.html'), 'utf8'))
  .replace('<!-- STYLES -->', '<link rel="stylesheet" href="./style.css">')
  .replace('REFERENCE_IMAGE_DATA', './assets/reference.jpg')
  .replace('<!-- SCRIPT -->', '<script defer src="./app.js"></script>');
await writeFile(path.join(catOut, 'index.html'), catHTML);

// Keep video export available without depending on a third-party CDN.
await mkdir(path.join(dist, 'dither-motion/vendor'), { recursive: true });
await cp(require.resolve('mp4-muxer'), path.join(dist, 'dither-motion/vendor/mp4-muxer.js'));

for (const { slug } of projects) {
  const file = path.join(dist, slug, 'index.html');
  let html = await readFile(file, 'utf8');
  html = html.replace('</body>', `<script defer src="../shared/nav.js" data-piece="${slug}"></script>\n</body>`);
  await writeFile(file, html);
}

await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(dist, 'THIRD_PARTY_NOTICES.md'));
await cp(path.join(root, 'projects/architecture/THIRD_PARTY_NOTICES.md'), path.join(dist, 'architecture/THIRD_PARTY_NOTICES.md'));
await cp(path.join(catSource, 'sfx/CREDITS.md'), path.join(catOut, 'SOUND-CREDITS.md'));
for (const [name, packageName] of [['three', 'three'], ['mp4-muxer', 'mp4-muxer']]) {
  const packageDir = path.resolve(path.dirname(require.resolve(packageName)), '..');
  const licenses = (await readdir(packageDir)).filter(file => /^licen[cs]e(?:\.|$)/i.test(file));
  for (const file of licenses) {
    await mkdir(path.join(dist, 'licenses'), { recursive: true });
    await cp(path.join(packageDir, file), path.join(dist, 'licenses', `${name}-${file}`));
  }
}
await writeFile(path.join(dist, '.nojekyll'), '');
await writeFile(path.join(dist, 'build.json'), JSON.stringify({ base, projects: projects.map(project => project.slug) }, null, 2));
console.log(`Built ${projects.length} experiments. Base path: ${base}`);
