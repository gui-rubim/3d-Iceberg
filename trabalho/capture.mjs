// Renders the critic package: 6 fixed poses + the scripted 60 s sequence (fixed 1/60 s step, recorded inputs), headless.
// usage: node capture.mjs <outdir> [res=2560x1440] [poses=1] [seq=1] [video=../descida.mp4]
import { launch, serve, FFMPEG, HERE, PIXFMT } from './lib.mjs';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const a = Object.fromEntries(process.argv.slice(3).map(s => s.split('=')));
const out = path.resolve(process.argv[2]); fs.mkdirSync(out, { recursive: true });
const res = a.res || '2560x1440'; const [w, h] = res.split('x').map(Number);
const inputs = JSON.parse(fs.readFileSync(path.join(HERE, 'entradas.json'), 'utf8'));
let onFrame = null;
const { srv, url } = await serve((u, buf) => onFrame(buf, u));
const { browser, page } = await launch({ w, h });
await page.goto(`${url}/index.html?manual=1&res=${res}`);
await page.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
const png = (buf, file) => { fs.writeFileSync(file + '.raw', buf); execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', PIXFMT, '-s', res, '-i', file + '.raw', '-frames:v', '1', file]); fs.unlinkSync(file + '.raw'); };
export const POSES = [
  ['pose1_acima_aberta', '0,0'],
  ['pose2_acima_perto_linha_dagua', 'p:-22,3.2,92,4,13,30,42'],
  ['pose3_linha_dagua_meio_a_meio', '0.2,0'],
  ['pose4_logo_abaixo_olhando_para_cima', '0.346,0'],
  ['pose5_profundidade_media', '0.62,0'],
  ['pose6_fundo_veios', '1,0'],
];
if (a.poses !== '0') for (const [name, it] of POSES) {
  let last = null; onFrame = (b) => { last = b; };
  await page.evaluate(async ([it, url]) => {
    const D = window.__demo, S = D.S;
    if (it.startsWith('p:')) D.setPose(it.slice(2).split(',').map(Number));
    else { D.setPose(null); const [d, az] = it.split(',').map(Number); S.d = S.target = S.goal = d; S.az = S.azGoal = az; }
    S.mode = 1; S.straight = S.sb = 0; S.auto = 0; S.time = 20; S.lastY = -1; S.plungeAge = 99; S.wet = 0; S.reset = 1; S.vel = 0;
    for (let i = 0; i < 32; i++) await D.step(1 / 60, i === 31, url + '/f');
  }, [it, url]);
  png(last, path.join(out, name + '.png')); console.log('pose', name);
}
if (a.seq !== '0') {
  const N = inputs.frames;
  const video = a.video ? path.resolve(a.video) : path.join(out, 'descida.mp4');
  const h264 = path.join(out, 'descida.h264'); const hfd = fs.openSync(h264, 'w');
  const resetSeq = () => page.evaluate(() => { const D = window.__demo, S = D.S; D.setPose(null);
    Object.assign(S, { straight: 0, sb: 0, d: 0, vel: 0, target: 0, goal: 0, az: 0, azGoal: 0, azKey: 0, mode: 0, auto: 0, keys: 0, time: 0, frame: 0, wet: 0, emerge: 99, plungeAge: 99, lastY: 15, reset: 1 }); });
  const marks = [...new Set([0, ...inputs.eventos.map(e => e.frame), N])].sort((x, y) => x - y);
  const fire = async (f) => { for (const e of inputs.eventos) if (e.frame === f) { if (e.tipo === 'keydown') await page.keyboard.down(e.code); else await page.keyboard.up(e.code); } };
  // ---- pass 1 (tiny, same simulation): find the two surface crossings for the 8-frame bursts ----
  await resetSeq();
  let ys = [];
  for (let k = 0; k + 1 < marks.length; k++) { await fire(marks[k]);
    ys = ys.concat(await page.evaluate(async (n) => { const D = window.__demo, o = []; for (let i = 0; i < n; i++) { await D.step(1 / 60, false); o.push(D.state().rel); } return o; }, marks[k + 1] - marks[k])); }
  const down = ys.findIndex((y, i) => i > 0 && ys[i - 1] > 0 && y <= 0) - 4;
  const upx = ys.findIndex((y, i) => i > 2100 && ys[i - 1] < 0 && y >= 0) - 4;
  const bursts = { travessia_descendo: down, fundo: 1800, travessia_subindo: upx };
  const lossless = new Map();
  for (let f = 0; f < N; f += 30) lossless.set(f, `seq_${String(f).padStart(4, '0')}_t${(f / 60).toFixed(1)}s.png`);
  for (const [n, s] of Object.entries(bursts)) for (let i = 0; i < 8; i++) lossless.set(s + i, (lossless.has(s + i) ? lossless.get(s + i) + '|' : '') + `rajada_${n}_${i}_f${String(s + i).padStart(4, '0')}.png`);
  console.log('bursts', JSON.stringify(bursts));
  // ---- pass 2: real render. Video through the in-browser hardware H.264 encoder, critic stills lossless ----
  await resetSeq();
  // Without a hardware H.264 encoder in the browser (Linux), every frame is read back raw and piped to libx264 instead.
  const HW = a.x264 === '1' ? false : await page.evaluate(([w, h]) => VideoEncoder.isConfigSupported({ codec: 'avc1.640033', width: w, height: h, bitrate: 40e6, framerate: 60, hardwareAcceleration: 'prefer-hardware' }).then(r => !!r.supported, () => false), [w, h]);
  console.log('vídeo:', HW ? 'codificador H.264 de hardware do navegador' : 'quadros crus -> ffmpeg libx264');
  let x264 = null, x264done = null, recv = 0;
  if (!HW) {
    x264 = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', PIXFMT, '-s', res, '-r', '60', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-movflags', '+faststart', video], { stdio: ['pipe', 'inherit', 'inherit'] });
    x264done = new Promise(r => x264.on('close', r));
  }
  await page.evaluate(([w, h, HW]) => {
    if (!HW) { window.__enc = { chunks: [], n: 0, enc: { encodeQueueSize: 0, flush: async () => {}, close: () => {} } }; return; }
    const E = window.__enc = { chunks: [], n: 0 };
    E.enc = new VideoEncoder({ output: (c) => { const b = new Uint8Array(c.byteLength); c.copyTo(b); E.chunks.push(b); }, error: (e) => console.log('encoder error ' + e.message) });
    E.enc.configure({ codec: 'avc1.640033', width: w, height: h, bitrate: 40e6, framerate: 60, avc: { format: 'annexb' }, hardwareAcceleration: 'prefer-hardware', latencyMode: 'quality' });
    const cv = document.getElementById('c');
    window.__demo.afterRender = () => { const vf = new VideoFrame(cv, { timestamp: Math.round(E.n * 1e6 / 60), duration: Math.round(1e6 / 60) }); E.enc.encode(vf, { keyFrame: E.n % 60 === 0 }); vf.close(); E.n++; };
  }, [w, h, HW]);
  const csv = ['frame,time_s,d,cam_x,cam_y,cam_z,az'];
  const t0 = Date.now(); let f = 0, pending = null;
  onFrame = HW ? (b) => { if (pending) for (const nm of pending.split('|')) png(b, path.join(out, nm)); else fs.writeSync(hfd, b); }
    : (b, u) => { if (u !== '/f') return; const i = recv++; if (lossless.has(i)) for (const nm of lossless.get(i).split('|')) png(b, path.join(out, nm));
        return new Promise(r => { if (x264.stdin.write(b)) r(); else x264.stdin.once('drain', r); }); };
  const runTo = async (end) => {
    while (f < end) {
      let n = 0; while (f + n < end && (!HW || !lossless.has(f + n)) && n < 30) n++;
      const cap = !HW || n === 0; if (n === 0) n = 1;
      pending = cap ? lossless.get(f) : null;
      const rows = await page.evaluate(async ([n, cap, url]) => { const D = window.__demo, E = window.__enc, o = [];
        for (let i = 0; i < n; i++) { await D.step(1 / 60, cap, url + '/f'); const s = D.state(); o.push([s.d, s.cam[0], s.cam[1], s.cam[2], s.az]); while (E.enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2)); }
        return o; }, [n, cap, url]);
      pending = null;
      rows.forEach((st, i) => csv.push([f + i, ((f + i) / 60).toFixed(4), ...st.map(x => x.toFixed(4))].join(',')));
      f += n;
      const blobs = await page.evaluate(async (url) => { const E = window.__enc; const c = E.chunks; E.chunks = []; if (c.length) await fetch(url + '/v', { method: 'POST', body: new Blob(c) }); return c.length; }, url);
      if (f % 300 < n) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  };
  for (let k = 0; k + 1 < marks.length; k++) { await fire(marks[k]); await runTo(marks[k + 1]); }
  await page.evaluate(async (url) => { const E = window.__enc; await E.enc.flush(); if (E.chunks.length) await fetch(url + '/v', { method: 'POST', body: new Blob(E.chunks) }); E.enc.close(); window.__demo.afterRender = null; }, url);
  fs.closeSync(hfd);
  if (HW) execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-r', '60', '-f', 'h264', '-i', h264, '-c', 'copy', '-movflags', '+faststart', video]);
  else { x264.stdin.end(); await x264done; if (recv !== N) console.log(`AVISO: ${recv} quadros recebidos, esperados ${N}`); }
  fs.unlinkSync(h264);
  fs.writeFileSync(path.join(out, 'camera_path.csv'), csv.join('\n'));
  console.log('video', video, fs.statSync(video).size, 'bytes', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
await browser.close(); srv.close();
