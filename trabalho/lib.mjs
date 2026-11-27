// Shared tooling: browser launch + local static server (serves ../index.html, receives frames)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
const MAC = process.platform === 'darwin';
const EXE = process.env.CHROME || (MAC ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const LOCAL_FF = path.join(HERE, 'node_modules/ffmpeg-static/ffmpeg');
export const FFMPEG = process.env.FFMPEG || (fs.existsSync(LOCAL_FF) ? LOCAL_FF : 'ffmpeg');
// macOS: ANGLE on Metal. Linux: Dawn needs Vulkan turned on explicitly.
// canvas preferred format: bgra8unorm on macOS, rgba8unorm on Linux (raw frame dumps follow it)
export const PIXFMT = MAC ? 'bgra' : 'rgba';
const GPU_ARGS = MAC ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-features=Vulkan,WebGPUDeveloperFeatures'];
export async function launch({ headless = true, w = 2560, h = 1440, extra = [] } = {}) {
  const browser = await chromium.launch({ headless, executablePath: EXE, args: [
    '--enable-unsafe-webgpu', '--enable-features=WebGPUDeveloperFeatures', '--enable-dawn-features=allow_unsafe_apis',
    ...GPU_ARGS, '--ignore-gpu-blocklist', '--enable-gpu', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...extra] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text(); if (!t.startsWith('[q]')) console.log('[page]', t.slice(0, 2000)); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 2000)));
  return { browser, page };
}
// onPost(urlPath, Buffer) handles frame uploads
export function serve(onPost) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      if (req.method === 'POST') {
        const chunks = []; req.on('data', c => chunks.push(c));
        req.on('end', async () => { try { await onPost?.(req.url, Buffer.concat(chunks)); rsp.writeHead(200); rsp.end('ok'); } catch (e) { console.log(e); rsp.writeHead(500); rsp.end(); } });
        return;
      }
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
