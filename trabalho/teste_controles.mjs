// Automated controls test. Real input events (Playwright) -> effect on the page state, in fixed 1/60 s steps.
// Then the full scripted 60 s sequence is simulated frame by frame checking camera validity, ice clearance and world limits.
// usage: node teste_controles.mjs
import { launch, serve, HERE } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const { srv, url } = await serve(() => {});
const { browser, page } = await launch({ w: 1280, h: 720 });
await page.goto(`${url}/index.html?manual=1&res=320x180`);
await page.waitForFunction(() => window.__demo && window.__demo.ready, null, { timeout: 180000 });
const results = [];
const ok = (name, cond, info = '') => { results.push({ teste: name, passou: !!cond, info: String(info) }); console.log((cond ? 'PASSOU ' : 'FALHOU ') + name + (info ? '  [' + info + ']' : '')); };
const step = (n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await window.__demo.step(1 / 60, false); return window.__demo.state(); }, n);
const reset = (d = 0.5) => page.evaluate((d) => { const S = window.__demo.S; Object.assign(S, { straight: 0, sb: 0, d, vel: 0, target: d, goal: d, az: 0, azGoal: 0, azKey: 0, mode: 1, auto: 0, keys: 0 }); window.__demo.setPose(null); }, d);
const f = (x) => x.toFixed(4);
await page.mouse.move(640, 360);

// --- wheel ---
await reset(0.5); let a = await step(1);
await page.mouse.wheel(0, 400); let b = await step(90);
ok('rolagem para baixo aumenta a profundidade', b.d > a.d + 0.01, `${f(a.d)} -> ${f(b.d)}`);
await page.mouse.wheel(0, -800); let c = await step(120);
ok('rolagem para cima diminui a profundidade', c.d < b.d - 0.01, `${f(b.d)} -> ${f(c.d)}`);
// inertia / smoothing: position keeps changing after the event and never jumps
await reset(0.5); await page.mouse.wheel(0, 300); const s1 = await step(1), s2 = await step(1), s30 = await step(30);
ok('rolagem tem inércia e suavização (sem salto, continua após o evento)', s1.d - 0.5 < 0.01 && s30.d > s2.d, `1 quadro: ${f(s1.d)}, 32 quadros: ${f(s30.d)}`);
// --- clamps ---
await reset(0.9); for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 2000); b = await step(600);
ok('extremo inferior trava em 1', b.d <= 1 && b.d > 0.999 && b.goal === 1, `d=${b.d}`);
await reset(0.1); for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -2000); b = await step(600);
ok('extremo superior trava em 0', b.d >= 0 && b.d < 0.001 && b.goal === 0, `d=${b.d}`);
// --- vertical drag (mouse) ---
await reset(0.5); a = await step(1);
await page.mouse.move(640, 500); await page.mouse.down(); await page.mouse.move(640, 300, { steps: 8 }); await page.mouse.up(); b = await step(90);
ok('arrasto vertical para cima desce (como a rolagem)', b.d > a.d + 0.01, `${f(a.d)} -> ${f(b.d)}`);
await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(640, 600, { steps: 8 }); await page.mouse.up(); c = await step(120);
ok('arrasto vertical para baixo sobe', c.d < b.d - 0.01, `${f(b.d)} -> ${f(c.d)}`);
// --- horizontal drag rotates ---
await reset(0.5); a = await step(1);
await page.mouse.move(400, 360); await page.mouse.down(); await page.mouse.move(800, 360, { steps: 8 }); await page.mouse.up(); b = await step(60);
ok('arrasto horizontal gira a câmera em volta do iceberg', Math.abs(b.az - a.az) > 0.2 && Math.abs(b.d - a.d) < 1e-3, `az ${f(a.az)} -> ${f(b.az)}`);
// --- touch drag (pointer events of type touch) ---
await reset(0.5); a = await step(1);
await page.evaluate(() => { const c = document.getElementById('c'); const ev = (t, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: 300, clientY: y, bubbles: true, isPrimary: true })); ev('pointerdown', 500); for (let y = 480; y >= 300; y -= 20) ev('pointermove', y); ev('pointerup', 300); });
b = await step(90);
ok('arrasto vertical com o dedo (toque) desce', b.d > a.d + 0.01, `${f(a.d)} -> ${f(b.d)}`);
// --- keys held ---
for (const [key, dir, label] of [['KeyS', 1, 'S desce'], ['ArrowDown', 1, 'seta para baixo desce'], ['KeyW', -1, 'W sobe'], ['ArrowUp', -1, 'seta para cima sobe']]) {
  await reset(0.5); a = await step(1); await page.keyboard.down(key); b = await step(60); const mid = b.d; c = await step(60); await page.keyboard.up(key); const e = await step(120); const e2 = await step(30);
  ok(`${label} (contínuo enquanto segura, para ao soltar)`, (b.d - a.d) * dir > 0.01 && (c.d - mid) * dir > 0.01 && Math.abs(e2.d - e.d) < 2e-4, `${f(a.d)} -> ${f(b.d)} -> ${f(c.d)} | solto: ${f(e.d)}`);
}
// --- Home / End ---
await reset(0.4); await page.keyboard.press('End'); b = await step(600);
ok('End vai ao fundo', b.d > 0.999, `d=${f(b.d)}`);
await page.keyboard.press('Home'); b = await step(600);
ok('Home vai ao topo', b.d < 0.001, `d=${f(b.d)}`);
// --- Space: automatic tour, toggles ---
await reset(0); await page.keyboard.press('Space'); a = await step(1); b = await step(300);
ok('Espaço inicia a descida automática a partir do topo', a.auto === 1 && b.d > 0.15, `auto=${a.auto} d=${f(b.d)}`);
await page.keyboard.press('Space'); c = await step(1); const e3 = await step(240);
ok('Espaço de novo inverte para a subida automática', c.auto === 2 && e3.d < b.d, `auto=${c.auto} d ${f(b.d)} -> ${f(e3.d)}`);
await reset(0); await page.keyboard.press('Space'); b = await step(60 * 24);
ok('passeio automático chega ao fundo e encerra', b.d > 0.999 && b.auto === 0, `d=${f(b.d)} auto=${b.auto}`);
await page.keyboard.press('Space'); b = await step(60 * 24);
ok('passeio automático volta ao topo e encerra', b.d < 0.001 && b.auto === 0, `d=${f(b.d)} auto=${b.auto}`);
// --- C toggles camera mode ---
await reset(0.1); await page.keyboard.press('KeyC'); a = await step(1); const az0 = a.az; b = await step(120);
ok('C troca para órbita lenta (azimute avança sozinho)', a.mode === 0 && Math.abs(b.az - az0) > 0.03, `modo=${a.mode} az ${f(az0)} -> ${f(b.az)}`);
await page.keyboard.press('KeyC'); a = await step(240); b = await step(60);
ok('C volta para câmera fixa de frente', a.mode === 1 && Math.abs(b.az - a.az) < 1e-3 && Math.abs(Math.sin(b.az)) < 0.02, `modo=${a.mode} az=${f(b.az)}`);
// --- A / D ---
await reset(0.1); a = await step(1); await page.keyboard.down('KeyD'); b = await step(60); await page.keyboard.up('KeyD'); await step(60);
ok('D gira a câmera', Math.abs(b.az - a.az) > 0.05, `az ${f(a.az)} -> ${f(b.az)}`);
c = await step(1); await page.keyboard.down('KeyA'); const g = await step(60); await page.keyboard.up('KeyA');
ok('A gira no sentido oposto', (g.az - c.az) * (b.az - a.az) < 0 && Math.abs(g.az - c.az) > 0.05, `az ${f(c.az)} -> ${f(g.az)}`);
// --- page does not scroll, canvas fills the window ---
const lay = await page.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { sx: scrollX, sy: scrollY, sh: document.documentElement.scrollHeight, ih: innerHeight, w: r.width, h: r.height, iw: innerWidth }; });
ok('a página não rola e o canvas ocupa a tela toda', lay.sx === 0 && lay.sy === 0 && lay.sh <= lay.ih && lay.w === lay.iw && lay.h === lay.ih, JSON.stringify(lay));

// --- scripted sequence: validity, ice clearance, world limits ---
const grad = await page.evaluate(() => window.__demo.loadSdf());
const inputs = JSON.parse(fs.readFileSync(path.join(HERE, 'entradas.json'), 'utf8'));
await page.evaluate(() => { const S = window.__demo.S; Object.assign(S, { straight: 0, sb: 0, d: 0, vel: 0, target: 0, goal: 0, az: 0, azGoal: 0, azKey: 0, mode: 0, auto: 0, keys: 0, time: 0, frame: 0, lastY: 15 }); });
let minIce = 1e9, minIceAt = 0, bad = 0, maxD = 0, minD = 1, maxR = 0, minY = 1e9, maxY = -1e9, maxStep = 0, maxJerk = 0, last = null, lastV = null, reached = 0, back = 0;
const run = (n) => page.evaluate(async (n) => { const D = window.__demo, out = []; for (let i = 0; i < n; i++) { await D.step(1 / 60, false); const s = D.state(); out.push([s.d, ...s.cam, ...s.fwd, D.iceDist(s.cam[0], s.cam[1], s.cam[2])]); } return out; }, n);
const marks = [...new Set([0, ...inputs.eventos.map(e => e.frame), inputs.frames])].sort((x, y) => x - y);
let frames = 0;
for (let k = 0; k + 1 < marks.length; k++) {
  for (const e of inputs.eventos) if (e.frame === marks[k]) { if (e.tipo === 'keydown') await page.keyboard.down(e.code); else await page.keyboard.up(e.code); }
  for (let f0 = marks[k]; f0 < marks[k + 1]; f0 += 120) {
    const rows = await run(Math.min(120, marks[k + 1] - f0)); frames += rows.length;
    for (const r of rows) {
      if (!r.every(Number.isFinite) || Math.abs(Math.hypot(r[4], r[5], r[6]) - 1) > 1e-3 || r[0] < 0 || r[0] > 1) bad++;
      if (r[7] < minIce) { minIce = r[7]; minIceAt = r[2]; }
      maxD = Math.max(maxD, r[0]); minD = Math.min(minD, r[0]); maxR = Math.max(maxR, Math.hypot(r[1], r[3])); minY = Math.min(minY, r[2]); maxY = Math.max(maxY, r[2]);
      if (last) {
        const v = [r[1] - last[1], r[2] - last[2], r[3] - last[3]];
        maxStep = Math.max(maxStep, Math.hypot(...v));
        if (lastV) maxJerk = Math.max(maxJerk, Math.hypot(v[0] - lastV[0], v[1] - lastV[1], v[2] - lastV[2]));
        lastV = v;
      }
      last = r; if (r[0] > 0.999) reached = 1; if (reached && r[0] < 0.001) back = 1;
    }
  }
}
ok('sequência roteirizada tem 3600 quadros (60 s a 1/60 s)', frames === 3600, `${frames} quadros`);
ok('sequência roteirizada vai do topo ao fundo e volta', reached && back, `d mín ${f(minD)} máx ${f(maxD)}`);
ok('nenhum quadro com câmera em estado inválido (NaN, direção não unitária, d fora de 0..1)', bad === 0, `${bad} quadros inválidos`);
// A jump is a change of velocity from one frame to the next, not speed itself: the camera legitimately moves at up to
// ~37 m/s near the top (orbit + pull-in). Speed is still bounded as a sanity check.
ok('movimento contínuo, sem salto de câmera entre quadros', maxJerk < 0.03 && maxStep < 1.0, `maior variação de passo ${maxJerk.toFixed(4)} m/quadro², maior passo ${maxStep.toFixed(3)} m/quadro`);
ok('câmera nunca atravessa o gelo (distância mínima ao gelo > 5 m)', minIce > 5, `mínimo ${minIce.toFixed(1)} m em y=${minIceAt.toFixed(1)}`);
// World limits: ocean is an infinite analytic plane and deep water has no floor; the only finite objects are the ice volume and the floating-ice disc (r < 345 m).
ok('câmera dentro do mundo: raio <= 215 m, y entre -216 e 16 m (sem piso nem parede para mostrar)', maxR <= 215.5 && minY > -216.5 && maxY < 16.5, `raio máx ${maxR.toFixed(1)} m, y ${minY.toFixed(1)}..${maxY.toFixed(1)}`);
// sweep every depth and azimuth the controls can reach
const sweep = await page.evaluate(() => { const D = window.__demo; let m = 1e9; for (let i = 0; i <= 400; i++) for (let j = 0; j < 180; j++) { const c = D.camAt(i / 400, j / 180 * 2 * Math.PI); m = Math.min(m, D.iceDist(c[0], c[1] + 0.6, c[2]), D.iceDist(c[0], c[1] - 0.6, c[2])); } return m; });
ok('varredura de todas as profundidades e azimutes alcançáveis: sem atravessar o gelo', sweep > 5, `distância mínima ${sweep.toFixed(1)} m`);
// --- straight descent (V): same distance and tilt as at the top, only the height changes ---
await reset(0); a = await step(2); await page.keyboard.press('KeyV'); b = await step(300);
ok('V liga a descida reta', a.straight === 0 && b.straight === 1, `reta ${a.straight} -> ${b.straight}`);
const top = await step(1); await page.keyboard.press('End'); const bot = await step(900);
ok('descida reta: só a altura muda (posição horizontal e direção da câmera iguais no topo e no fundo)',
  bot.d > 0.999 && Math.hypot(bot.cam[0] - top.cam[0], bot.cam[2] - top.cam[2]) < 0.01 && Math.hypot(bot.fwd[0] - top.fwd[0], bot.fwd[1] - top.fwd[1], bot.fwd[2] - top.fwd[2]) < 1e-4 && top.cam[1] > 14 && bot.cam[1] < -214,
  `xz (${top.cam[0].toFixed(2)}, ${top.cam[2].toFixed(2)}) -> (${bot.cam[0].toFixed(2)}, ${bot.cam[2].toFixed(2)}), y ${top.cam[1].toFixed(1)} -> ${bot.cam[1].toFixed(1)}`);
const sweepS = await page.evaluate(() => { const D = window.__demo; const R = D.straightR; let m = 1e9; for (let i = 0; i <= 400; i++) { const y = D.camAt(i / 400, 0)[1]; for (let j = 0; j < 180; j++) { const az = j / 180 * 2 * Math.PI; m = Math.min(m, D.iceDist(Math.sin(az) * R, y, Math.cos(az) * R)); } } return { m, R }; });
ok('descida reta: varredura de profundidades e azimutes sem atravessar o gelo', sweepS.m > 5 && sweepS.R <= 300, `distância mínima ${sweepS.m.toFixed(1)} m, raio ${sweepS.R.toFixed(1)} m`);
await page.keyboard.press('KeyV'); b = await step(2);
ok('V de novo volta ao caminho original', b.straight === 0, `reta ${b.straight}`);
console.log('campo de distância: gradiente máx', grad.maxGrad.toFixed(2), 'fração > 1:', grad.fracOver1.toFixed(4));
const fails = results.filter(r => !r.passou).length;
fs.writeFileSync(path.join(HERE, 'teste_controles_resultado.json'), JSON.stringify({ total: results.length, falhas: fails, resultados: results }, null, 1));
console.log(`\n${results.length - fails}/${results.length} testes passaram`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
