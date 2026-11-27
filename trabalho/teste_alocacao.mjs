// Per-frame JS allocation check: Chrome heap sampling profiler over 10 s of the real rAF loop.
// Lists every sampled allocation by call site; anything attributed to the page's own frame code is a failure.
import { launch, serve } from './lib.mjs';
const { srv, url } = await serve();
const { browser, page } = await launch({ w: 640, h: 360 });
await page.goto(`${url}/index.html?res=320x180`);
await page.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
await page.keyboard.press('Space'); await page.waitForTimeout(25000); // warm-up: let the JIT settle
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage');
const f0 = await page.evaluate(() => window.__demo.S.frame);
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
await page.keyboard.press('Space'); await page.waitForTimeout(10000);
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const f1 = await page.evaluate(() => window.__demo.S.frame);
const sites = [];
(function walk(n, stack) { const s = [...stack, n.callFrame.functionName || '(anon)']; if (n.selfSize > 0) sites.push({ bytes: n.selfSize, fn: n.callFrame.functionName || '(anon)', line: n.callFrame.lineNumber, url: n.callFrame.url.split('/').pop(), stack: s.slice(-4).join(' > ') }); (n.children || []).forEach(c => walk(c, s)); })(profile.head, []);
sites.sort((a, b) => b.bytes - a.bytes);
const frames = f1 - f0;
const own = sites.filter(s => s.url.startsWith('index.html'));
console.log(`quadros: ${frames}`);
for (const s of sites) console.log(`${s.bytes} B  (${(s.bytes / frames).toFixed(1)} B/quadro)  ${s.stack}  [${s.url}:${s.line}]`);
console.log(own.length ? `FALHOU: ${own.reduce((p, c) => p + c.bytes, 0)} B atribuídos ao código da página` : 'PASSOU: nenhuma alocação amostrada no código da página durante os quadros');
await browser.close(); srv.close();
