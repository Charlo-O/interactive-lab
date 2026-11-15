import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basePath } from './projects.mjs';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const base = basePath();
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.md': 'text/plain; charset=utf-8' };

export function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/' && base !== '/') {
        response.writeHead(302, { Location: base }); response.end(); return;
      }
      if (!url.pathname.startsWith(base)) throw new Error('Outside site');
      const relative = decodeURIComponent(url.pathname.slice(base.length));
      let file = path.resolve(root, relative);
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Outside site');
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith('/')) {
          response.writeHead(301, { Location: url.pathname + '/' + url.search }); response.end(); return;
        }
        file = path.join(file, 'index.html');
      }
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-cache');
      response.end(await readFile(file));
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}${base}`));
}
