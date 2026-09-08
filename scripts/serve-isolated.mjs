import http from 'node:http';
import { readFile, writeFile, mkdir, copyFile, rename } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { onRequest as stateHandler } from '../functions/api/state.js';
import { onRequestPost as login } from '../functions/api/auth/login.js';
import { onRequestGet as session } from '../functions/api/auth/session.js';
import * as users from '../functions/api/auth/users.js';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4180);
const directory = resolve(root, process.env.LOCAL_TEST_DIR || '.local-stability');
if (!directory.startsWith(root + sep) || !directory.split(sep).at(-1).startsWith('.local-')) throw Error('Use a .local-* directory inside the workspace.');
await mkdir(directory, { recursive: true });
const statePath = join(directory, 'state.json');
try { await readFile(statePath); } catch { await copyFile(resolve(root, process.env.LOCAL_SOURCE || 'campaign-state.json'), statePath); }
const secretPath = join(directory, 'session-secret');
try { await readFile(secretPath); } catch { await writeFile(secretPath, randomBytes(48).toString('hex'), { flag: 'wx' }); }
let saved = JSON.parse(await readFile(statePath, 'utf8'));
let writes = Promise.resolve();
const env = {
  SESSION_SECRET: await readFile(secretPath, 'utf8'),
  LOCAL_STORE: {
    read: async () => { await writes; return { state_json: structuredClone(saved), revision: Number(saved.revision) || 0 }; },
    write: (state, revision) => {
      const operation = writes.then(async () => {
        if ((Number(saved.revision) || 0) !== revision) throw Object.assign(new Error('Revision conflict'), { status: 409 });
        await writeFile(statePath + '.tmp', JSON.stringify(state));
        await rename(statePath + '.tmp', statePath);
        saved = structuredClone(state);
        return [{ revision: saved.revision }];
      });
      writes = operation.catch(() => {});
      return operation;
    }
  }
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const publicFiles = new Set(['index.html', 'app.js', 'styles.css', 'catalog-worker.js', 'table-data.json', 'templo-esmeralda-icon.png']);
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(url, { method: req.method, headers: req.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      const handler = url.pathname === '/api/state' ? stateHandler : url.pathname === '/api/auth/login' && req.method === 'POST' ? login : url.pathname === '/api/auth/session' && req.method === 'GET' ? session : url.pathname === '/api/auth/users' ? users['onRequest' + req.method[0] + req.method.slice(1).toLowerCase()] : null;
      const response = handler ? await handler({ request, env }) : new Response('Not found', { status: 404 });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const name = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
    const path = resolve(root, name);
    if (!path.startsWith(root + sep) || (!publicFiles.has(name) && !name.startsWith('assets/'))) { res.writeHead(404); res.end(); return; }
    let body = await readFile(path);
    if (name === 'index.html') body = Buffer.from(body.toString().replace('</head>', '<meta name="server-auth" content="true"></head>'));
    res.writeHead(200, { 'Content-Type': (types[extname(name)] || 'application/octet-stream') + (['.html', '.css', '.js'].includes(extname(name)) ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Local preview error'); }
}).listen(port, '127.0.0.1', () => console.log(`Isolated preview: http://127.0.0.1:${port} (no Supabase connection)`));
