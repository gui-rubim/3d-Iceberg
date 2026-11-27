// usage: node sheet.mjs out.png "d,az;d,az;..." [res=960x540] [cols=3] [frames=20]   (item may also be p:x,y,z,tx,ty,tz,fov)
import { launch, serve, FFMPEG, PIXFMT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const a = Object.fromEntries(process.argv.slice(4).map(s => s.split('=')));
const out = process.argv[2]; const items = process.argv[3].split(';');
const res = a.res || '960x540'; const [w, h] = res.split('x').map(Number);
let frame = null;
const { srv, url } = await serve((u, buf) => { frame = buf; });
const { browser, page } = await launch({ w, h });
await page.goto(`${url}/index.html?manual=1&res=${res}`);
await page.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
const files = [];
for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const ms = await page.evaluate(async ([it, frames, url, time, st]) => {
    const D = window.__demo, S = D.S;
    if (it.startsWith('p:')) D.setPose(it.slice(2).split(',').map(Number));
    else { D.setPose(null); const [d, az] = it.split(',').map(Number); S.d = S.target = S.goal = d; S.az = S.azGoal = az || 0; }
    S.mode = 1; S.straight = S.sb = +st; S.time = time; S.lastY = -1; S.plungeAge = 99; S.wet = 0; S.reset = 1; S.vel = 0;
    const t = performance.now();
    for (let i = 0; i < frames; i++) await D.step(1 / 60, i === frames - 1, url + '/f');
    return (performance.now() - t) / frames;
  }, [it, +(a.frames || 20), url, +(a.time || 20), +(a.straight || 0)]);
  const f = `${out}.${i}.png`;
  fs.writeFileSync(f + '.raw', frame);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', PIXFMT, '-s', res, '-i', f + '.raw', '-frames:v', '1', f]);
  fs.unlinkSync(f + '.raw'); files.push(f);
  console.log(it, ms.toFixed(1) + ' ms/frame');
}
const cols = +(a.cols || 3), rows = Math.ceil(files.length / cols);
if (files.length > 1) {
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...files.flatMap(f => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|')}`, '-frames:v', '1', out]);
  files.forEach(f => fs.unlinkSync(f));
} else fs.renameSync(files[0], out);
await browser.close(); srv.close();
