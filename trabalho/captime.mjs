import { launch, serve } from './lib.mjs';
let n = 0; const { srv, url } = await serve((u, b) => { n += b.length; });
const { browser, page } = await launch({ w: 2560, h: 1440 });
await page.goto(`${url}/index.html?manual=1&res=2560x1440`);
await page.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
for (const cap of [false, true]) {
  const t = Date.now();
  for (let i = 0; i < 20; i++) await page.evaluate(async ([url, cap]) => { await window.__demo.step(1 / 60, cap, url + '/f'); }, [url, cap]);
  console.log('capture', cap, (Date.now() - t) / 20, 'ms/frame');
}
const t = Date.now();
await page.evaluate(async () => { for (let i = 0; i < 20; i++) await window.__demo.step(1 / 60, false); });
console.log('in-page loop no capture', (Date.now() - t) / 20, 'ms/frame');
await browser.close(); srv.close();
