// GPU timing. usage: node perf.mjs static "0,0.2,0.3,0.6,1" [res=2560x1440]   |   node perf.mjs seq [res=2560x1440]
// Runs in a visible window, in real time; reads WebGPU timestamp queries collected by the page (?perf).
import { launch, serve } from './lib.mjs';
import fs from 'node:fs';
const mode = process.argv[2] || 'static';
const a = Object.fromEntries(process.argv.slice(mode === 'static' ? 4 : 3).map(s => s.split('=')));
const res = a.res || '2560x1440';
const { srv, url } = await serve();
const { browser, page } = await launch({ headless: false, w: 1200, h: 675 });
await page.goto(`${url}/index.html?perf=1&res=${res}`);
await page.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
const stats = (v) => { const s = [...v].sort((x, y) => x - y); const n = s.length; return n ? { n, mean: +(s.reduce((p, c) => p + c, 0) / n).toFixed(2), p50: +s[n >> 1].toFixed(2), p99: +s[Math.min(n - 1, Math.floor(n * 0.99))].toFixed(2), max: +s[n - 1].toFixed(2) } : { n: 0 }; };
if (mode === 'static') {
  for (const d of process.argv[3].split(',').map(Number)) {
    const r = await page.evaluate(async (d) => {
      const D = window.__demo, S = D.S; S.d = S.target = S.goal = d; S.vel = 0; S.mode = 1; S.straight = S.sb = 0; S.auto = 0;
      await new Promise(r => setTimeout(r, 1500)); const n0 = D.log.n;
      await new Promise(r => setTimeout(r, 4000)); const n1 = D.log.n;
      const g = [], parts = [0, 0, 0, 0, 0, 0];
      for (let i = n0; i < n1; i++) { g.push(D.log.gpu[i]); for (let k = 0; k < 6; k++) parts[k] += D.log.parts[i * 6 + k] / (n1 - n0); }
      return { g, parts: parts.map(x => +x.toFixed(2)), fps: (n1 - n0) / 4 };
    }, d);
    console.log(`d=${d}`, JSON.stringify(stats(r.g)), 'waves/scene/taa/particles/mblur/bloom+final:', r.parts.join(' / '), 'fps', r.fps);
  }
} else {
  // scripted 60 s sequence driven by real key events at simulation times 5 s and 35 s
  await page.evaluate(() => { const S = window.__demo.S; S.time = 0; window.__demo.log.n = 0; });
  let pressed = 0;
  for (;;) {
    const t = await page.evaluate(() => window.__demo.S.time);
    if (pressed === 0 && t >= 5) { await page.keyboard.press('Space'); pressed = 1; }
    if (pressed === 1 && t >= 35) { await page.keyboard.press('Space'); pressed = 2; }
    if (t >= 60) break;
    await new Promise(r => setTimeout(r, 15));
  }
  const L = await page.evaluate(() => { const D = window.__demo, n = Math.min(D.log.n, 9000); return { t: [...D.log.t.subarray(0, n)], y: [...D.log.y.subarray(0, n)], gpu: [...D.log.gpu.subarray(0, n)], cpu: [...D.log.cpu.subarray(0, n)] }; });
  const rows = L.t.map((t, i) => ({ t, y: L.y[i], gpu: L.gpu[i], frame: L.cpu[i] })).filter(r => r.t <= 60);
  fs.writeFileSync('perf_log.csv', 'sim_time_s,cam_y_m,gpu_ms,frame_interval_ms\n' + rows.map(r => `${r.t.toFixed(4)},${r.y.toFixed(3)},${r.gpu.toFixed(3)},${r.frame.toFixed(2)}`).join('\n'));
  const seg = { 'acima da água (y > 1,5 m)': r => r.y > 1.5, 'travessia (|y| <= 1,5 m)': r => Math.abs(r.y) <= 1.5, 'submerso (y < -1,5 m)': r => r.y < -1.5, 'total': r => true };
  const out = {};
  for (const [k, f] of Object.entries(seg)) { out[k] = { gpu_ms: stats(rows.filter(f).map(r => r.gpu)), intervalo_quadro_ms: stats(rows.filter(f).map(r => r.frame)) }; console.log(k, JSON.stringify(out[k])); }
  fs.writeFileSync('perf_report.json', JSON.stringify({ res, adapter: await page.evaluate(async () => { const a = await navigator.gpu.requestAdapter(); return a.info.vendor + ' ' + a.info.architecture + ' ' + a.info.device + ' ' + a.info.description; }), ua: await page.evaluate(() => navigator.userAgent), segments: out }, null, 1));
}
await browser.close(); srv.close();
