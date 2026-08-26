/* 体験版を手元で確認するための小さなサーバー。
   node tools/preview.mjs  →  http://localhost:4173/ */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
  '.pdf':'application/pdf', '.woff2':'font/woff2' };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // 本番（GitHub Pages）は /crowdworks-portfolio/ の下に置かれる。
    // 手元でも同じURLで見えるように、この接頭辞を外してから探す
    if (p === '/crowdworks-portfolio') p = '/';
    if (p.startsWith('/crowdworks-portfolio/')) p = p.slice('/crowdworks-portfolio'.length);
    if (p.includes('..')) { res.writeHead(400).end('bad path'); return; }
    let file = join(ROOT, p);
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); }
    catch {
      // 拡張子なしのURL（/quiz）は、静的な書き出しでは quiz.html になる
      try { await stat(file + '.html'); file += '.html'; }
      catch { res.writeHead(404).end('not found'); return; }
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream',
                         'cache-control': 'no-store' });
    res.end(body);
  } catch (e) { res.writeHead(404).end('not found'); }
}).listen(4173, () => console.log('http://localhost:4173/'));
