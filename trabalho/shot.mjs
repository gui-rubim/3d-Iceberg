// usage: node shot.mjs out.png [d=0.0] [az=0] [res=1280x720] [frames=24] [pose=x,y,z,tx,ty,tz,fov] [time=seconds]
import { launch, serve, FFMPEG } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const a = Object.fromEntries(process.argv.slice(3).map(s => s.split('=')));
const out = process.argv[2];
const res = a.res || '1280x720'; const [w, h] = res.split('x').map(Number);
let frame = null;
const { srv, url } = await serve((u, buf) => { frame = buf; });
const { browser, page } = await launch({ w, h });
const t0 = Date.now();
await page.goto(`${url}/index.html?manual=1&res=${res}${a.nohud ? '&nohud=1' : ''}`);
await page.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
console.log('ready in', Date.now() - t0, 'ms');
if (a.grad) console.log(await page.evaluate(() => window.__demo.loadSdf()));
const info = await page.evaluate(async ([d, az, frames, pose, time, url]) => {
  const D = window.__demo, S = D.S;
  S.d = S.target = S.goal = d; S.az = S.azGoal = az; S.mode = 1; S.straight = S.sb = 0; S.time = time; S.lastY = -1;
  if (pose) D.setPose(pose);
  const t = performance.now();
  for (let i = 0; i < frames; i++) await D.step(1 / 60, i === frames - 1, url + '/f');
  return { ms: (performance.now() - t) / frames, st: D.state() };
}, [+(a.d || 0), +(a.az || 0), +(a.frames || 24), a.pose ? a.pose.split(',').map(Number) : null, +(a.time || 20), url]);
console.log(JSON.stringify(info));
fs.writeFileSync(out + '.raw', frame);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', info.st.fmt === 'bgra8unorm' ? 'bgra' : 'rgba', '-s', res, '-i', out + '.raw', '-frames:v', '1', out]);
fs.unlinkSync(out + '.raw');
await browser.close(); srv.close();
