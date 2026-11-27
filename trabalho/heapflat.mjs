import { launch, serve } from './lib.mjs';
const { srv, url } = await serve();
const { browser, page } = await launch({ w: 640, h: 360, extra: ['--enable-precise-memory-info'] });
await page.goto(`${url}/index.html?res=320x180`);
await page.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
await page.keyboard.press('Space'); await page.waitForTimeout(+process.argv[2] || 20000);
const r = await page.evaluate(() => new Promise(res => { const out = []; const D = window.__demo; let n = 0; const id = setInterval(() => { out.push([D.S.frame, performance.memory.usedJSHeapSize]); if (++n >= 11) { clearInterval(id); res(out); } }, 1000); }));
for (let i = 1; i < r.length; i++) console.log(`+${r[i][0] - r[i - 1][0]} quadros  heap ${r[i][1]} B  delta ${r[i][1] - r[i - 1][1]} B  (${((r[i][1] - r[i - 1][1]) / (r[i][0] - r[i - 1][0])).toFixed(1)} B/quadro)`);
await browser.close(); srv.close();
