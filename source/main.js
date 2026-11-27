// Iceberg — WebGPU, no libraries. All per-frame state lives in preallocated buffers.
(async function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const canvas = document.getElementById('c');
  const bar = document.getElementById('load');
  const fail = (m) => { document.getElementById('msg').textContent = m; bar.style.display = 'none'; };
  if (!navigator.gpu) { fail('WebGPU indisponível neste navegador.'); return; }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) { fail('Nenhuma GPU compatível com WebGPU.'); return; }
  const hasTS = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
  device.addEventListener('uncapturederror', (e) => console.log('GPU error: ' + e.error.message));
  const ctx = canvas.getContext('webgpu');
  const FMT = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: FMT, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });

  const MANUAL = Q.has('manual');
  const PERF = Q.has('perf');
  const FIXED = Q.get('res') ? Q.get('res').split('x').map(Number) : null;
  const HDR = 'rgba16float';
  const TU = GPUTextureUsage;

  // ---------------- shader modules ----------------
  const mod = (name) => {
    const m = device.createShaderModule({ code: SH.common + '\n' + SH[name], label: name });
    m.getCompilationInfo().then((i) => { for (const x of i.messages) if (x.type === 'error') console.log('WGSL ' + name + ':' + x.lineNum + ' ' + x.message); });
    return m;
  };
  const mBake = mod('bake'), mWaves = mod('waves'), mScene = mod('scene'), mPost = mod('post'), mPart = mod('particles');
  const mCommon = device.createShaderModule({ code: SH.common });

  const UB = new Float32Array(52);
  const ubuf = device.createBuffer({ size: UB.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const sLin = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' });
  const sRep = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });

  const rp = (module, fs, targets, vs) => device.createRenderPipeline({
    layout: 'auto', vertex: { module: vs ? module : mCommon, entryPoint: vs || 'vsFull' },
    fragment: { module, entryPoint: fs, targets }, primitive: { topology: 'triangle-list' } });
  const bg = (pipe, group, res) => device.createBindGroup({ layout: pipe.getBindGroupLayout(group),
    entries: res.map((r, i) => r && { binding: i, resource: r }).filter(Boolean) });
  const ubg = (pipe) => bg(pipe, 0, [{ buffer: ubuf }]);

  // ---------------- startup bakes ----------------
  const noiseTex = device.createTexture({ size: [64, 64, 64], dimension: '3d', format: HDR, usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING });
  const sdfTex = device.createTexture({ size: [256, 320, 256], dimension: '3d', format: 'r16float', usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING | TU.COPY_SRC });
  const lightTex = device.createTexture({ size: [128, 160, 128], dimension: '3d', format: HDR, usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING });
  const pNoise = rp(mBake, 'fsNoise', [{ format: HDR }], 'vsBake');
  const pSdf = rp(mBake, 'fsSdf', [{ format: 'r16float' }], 'vsBake');
  const pLight = rp(mBake, 'fsLight', [{ format: HDR }], 'vsBake');
  let bakeDone = 0;
  const bakeTotal = 64 + 256 + 128;
  async function bakeSlices(tex, pipe, depth, group, batch) {
    const view = tex.createView();
    for (let z0 = 0; z0 < depth; z0 += batch) {
      const enc = device.createCommandEncoder();
      for (let z = z0; z < Math.min(depth, z0 + batch); z++) {
        const p = enc.beginRenderPass({ colorAttachments: [{ view, depthSlice: z, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
        p.setPipeline(pipe);
        if (group) p.setBindGroup(1, group);
        p.draw(3, 1, 0, z); p.end();
      }
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      bakeDone += batch; bar.style.transform = 'scaleX(' + Math.min(1, bakeDone / bakeTotal) + ')';
    }
  }
  await bakeSlices(noiseTex, pNoise, 64, null, 32);
  await bakeSlices(sdfTex, pSdf, 256, null, 16);
  await bakeSlices(lightTex, pLight, 128, bg(pLight, 1, [sdfTex.createView(), sLin]), 4);

  // ---------------- waves ----------------
  const WMIPS = 7;
  const waveTex = device.createTexture({ size: [256, 256, 3], format: HDR, mipLevelCount: WMIPS, usage: TU.STORAGE_BINDING | TU.TEXTURE_BINDING });
  const wview = (l) => waveTex.createView({ dimension: '2d-array', baseMipLevel: l, mipLevelCount: 1 });
  const pWaves = device.createComputePipeline({ layout: 'auto', compute: { module: mWaves, entryPoint: 'csWaves' } });
  const pMip = device.createComputePipeline({ layout: 'auto', compute: { module: mWaves, entryPoint: 'csMip' } });
  const gWaves0 = ubg(pWaves), gWaves1 = bg(pWaves, 1, [wview(0)]);
  const gMip = [];
  for (let l = 0; l < WMIPS - 1; l++) gMip.push(bg(pMip, 1, [wview(l + 1), wview(l)]));

  // ---------------- pipelines ----------------
  const pScene = rp(mScene, 'fs', [{ format: HDR }, { format: 'r32float' }]);
  const pTaa = rp(mPost, 'fsTaa', [{ format: HDR }, { format: HDR }]);
  const pMB = rp(mPost, 'fsMB', [{ format: HDR }]);
  const pDown = rp(mPost, 'fsDown', [{ format: HDR }]);
  const pUp = rp(mPost, 'fsUp', [{ format: HDR }]);
  const pExpo = rp(mPost, 'fsExpo', [{ format: HDR }]);
  const pFinal = rp(mPost, 'fsFinal', [{ format: FMT }]);
  const pPart = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPart, entryPoint: 'vsPart' },
    fragment: { module: mPart, entryPoint: 'fsPart', targets: [{ format: HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }] },
    primitive: { topology: 'triangle-strip' } });
  const NPART = 26000 + 240 + 420;
  const gU = { scene: ubg(pScene), taa: ubg(pTaa), mb: ubg(pMB), expo: ubg(pExpo), fin: ubg(pFinal), part: ubg(pPart) };
  const gScene = bg(pScene, 1, [sdfTex.createView(), lightTex.createView(), noiseTex.createView(), waveTex.createView({ dimension: '2d-array' }), sLin, sRep]);

  // ---------------- size-dependent resources ----------------
  const NB = 6;
  let W = 0, H = 0, R = null;
  const tex = (w, h, fmt) => device.createTexture({ size: [w, h], format: fmt, usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING }).createView();
  const pass = (views) => ({ colorAttachments: views.map((v) => ({ view: v, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] })) });
  const expoV = [tex(1, 1, HDR), tex(1, 1, HDR)];
  function resize() {
    let w, h;
    if (FIXED) { w = FIXED[0]; h = FIXED[1]; }
    else {
      const dpr = window.devicePixelRatio || 1;
      w = Math.max(16, Math.round(canvas.clientWidth * dpr)); h = Math.max(16, Math.round(canvas.clientHeight * dpr));
      const k = Math.sqrt((2560 * 1440) / (w * h));
      if (k < 1) { w = Math.round(w * k); h = Math.round(h * k); }
    }
    if (w === W && h === H) return;
    W = w; H = h; canvas.width = W; canvas.height = H;
    const r = {};
    r.col = tex(W, H, HDR); r.dep = tex(W, H, 'r32float');
    r.hist = [tex(W, H, HDR), tex(W, H, HDR)]; r.work = tex(W, H, HDR); r.mb = tex(W, H, HDR);
    r.dn = []; r.up = [];
    for (let i = 0; i < NB; i++) { const s = 2 << i; r.dn.push(tex(Math.max(1, W / s | 0), Math.max(1, H / s | 0), HDR)); }
    for (let i = 0; i < NB - 1; i++) { const s = 2 << i; r.up.push(tex(Math.max(1, W / s | 0), Math.max(1, H / s | 0), HDR)); }
    r.pScene = pass([r.col, r.dep]);
    r.pTaa = [pass([r.hist[0], r.work]), pass([r.hist[1], r.work])];
    r.gTaa = [bg(pTaa, 1, [r.col, r.dep, r.hist[1], null, sLin]), bg(pTaa, 1, [r.col, r.dep, r.hist[0], null, sLin])];
    r.pPart = pass([r.work]); r.pPart.colorAttachments[0].loadOp = 'load';
    r.gPart = [bg(pPart, 1, [r.dep, r.hist[0], lightTex.createView(), sLin]), bg(pPart, 1, [r.dep, r.hist[1], lightTex.createView(), sLin])];
    r.pMB = pass([r.mb]); r.gMB = bg(pMB, 1, [r.work, r.dep, null, null, sLin]);
    r.pDn = r.dn.map((v) => pass([v])); r.gDn = r.dn.map((v, i) => bg(pDown, 1, [i ? r.dn[i - 1] : r.mb, null, null, null, sLin]));
    r.pUp = r.up.map((v) => pass([v]));
    r.gUp = r.up.map((v, i) => bg(pUp, 1, [i === NB - 2 ? r.dn[NB - 1] : r.up[i + 1], r.dn[i], null, null, sLin]));
    r.pExpo = [pass([expoV[0]]), pass([expoV[1]])];
    r.gExpo = [bg(pExpo, 1, [r.dn[4], expoV[1], null, null, sLin]), bg(pExpo, 1, [r.dn[4], expoV[0], null, null, sLin])];
    r.gFin = [bg(pFinal, 1, [r.mb, r.up[0], expoV[0], r.hist[0], sLin]), bg(pFinal, 1, [r.mb, r.up[0], expoV[1], r.hist[1], sLin])];
    r.pFin = pass([null]);
    r.capRow = Math.ceil(W * 4 / 256) * 256;
    r.capBuf = MANUAL ? device.createBuffer({ size: r.capRow * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
    r.capSrc = { texture: null }; r.capDst = { buffer: r.capBuf, bytesPerRow: r.capRow }; r.capSize = [W, H];
    R = r; F[_reset] = 1;
  }

  // ---------------- timing queries ----------------
  const NQ = 14;
  const qs = hasTS && PERF ? device.createQuerySet({ type: 'timestamp', count: NQ }) : null;
  const qRes = qs && device.createBuffer({ size: NQ * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  const qPool = [], qFree = [];
  const LOGN = 9000;
  const log = { n: 0, t: new Float32Array(LOGN), y: new Float32Array(LOGN), gpu: new Float32Array(LOGN), cpu: new Float32Array(LOGN), parts: new Float32Array(LOGN * 6) };
  if (qs) for (let i = 0; i < 8; i++) { const b = device.createBuffer({ size: NQ * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }); qPool.push(b); qFree.push(b); }
  const TW = [];
  for (let a = 0; a < NQ; a += 2) TW.push(qs ? { querySet: qs, beginningOfPassWriteIndex: a, endOfPassWriteIndex: a + 1 } : undefined);
  const twCompute = { timestampWrites: TW[0] };

  // ---------------- state ----------------
  // All mutable state lives in one Float64Array (no boxed numbers, nothing for the GC to do per frame).
  const F = new Float64Array(34);
  const _d = 0, _vel = 1, _target = 2, _goal = 3, _az = 4, _azGoal = 5, _azKey = 6, _mode = 7, _auto = 8, _keys = 9, _time = 10, _frame = 11, _wet = 12, _emerge = 13, _plungeAge = 14, _px = 15, _py = 16, _pz = 17, _lastY = 18, _reset = 19, _drag = 20, _lx = 21, _ly = 22, _pose = 23, _hud = 24, _expo = 25, _dt = 26, _last = 27, _a0 = 28, _a1 = 29, _a2 = 30, _r0 = 31, _straight = 32, _sb = 33;
  F[_py] = -1;
  F[_lastY] = 15;
  F[_emerge] = 99;
  F[_plungeAge] = 99;
  F[_reset] = 1;
  F[_hud] = 1;
  F[_mode] = 1;      // opens on the fixed front camera
  F[_straight] = 1;  // ...going straight down: same distance and tilt as at the top, only the height changes (V toggles)
  F[_sb] = 1;
  const S = {}; // named view of F for the test / capture harness only
  ['d','vel','target','goal','az','azGoal','azKey','mode','auto','keys','time','frame','wet','emerge','plungeAge','px','py','pz','lastY','reset','drag','lx','ly','pose','hud','expo','dt','last','a0','a1','a2','r0','straight','sb'].forEach((n, i) => Object.defineProperty(S, n, { get: () => F[i], set: (v) => { F[i] = v; }, enumerable: true }));
  const POSE = new Float32Array(7);
  const DW = 0.2, YTOP = 15, YBOT = -215, LENS = 0.2;
  const RS = 280; // camera distance in straight mode (the floating-ice ring in scene.wgsl keeps clear of it)
  const KY = [15, 0, -12, -28, -60, -120, -215];
  const KP = [3.1, -2.5, 42, 40, 14, 2, 13];
  const KR = [205, 150, 153, 165, 190, 205, 168];
  // Helpers called from the frame take their number arguments in F[_a0.._a2] and leave the result in F[_r0]:
  // a double passed to or returned from a call that the JIT did not inline is a heap allocation.
  function camYs() { const d = F[_a0]; if (d < DW) { const k = 1 - d / DW; F[_r0] = YTOP * k * k; } else F[_r0] = YBOT * Math.pow((d - DW) / (1 - DW), 1.7); }
  function camY(d) { F[_a0] = d; camYs(); return F[_r0]; }
  function key(tab, y) { F[_a0] = y; keys(tab); return F[_r0]; }
  function keys(tab) {
    const y = F[_a0];
    let i = 0; while (i < 5 && y < KY[i + 1]) i++;
    const y0 = KY[i], y1 = KY[i + 1], h = y1 - y0, t = Math.min(1, Math.max(0, (y - y0) / h));
    const m0 = i > 0 ? (tab[i + 1] - tab[i - 1]) / (y1 - KY[i - 1]) : (tab[1] - tab[0]) / h;
    const m1 = i < 5 ? (tab[i + 2] - tab[i]) / (KY[i + 2] - y0) : (tab[6] - tab[5]) / h;
    const t2 = t * t, t3 = t2 * t;
    F[_r0] = (2 * t3 - 3 * t2 + 1) * tab[i] + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * tab[i + 1] + (t3 - t2) * h * m1;
  }
  // CPU copy of the two long-wave cascades so the camera can ride the swell near the surface
  const WV = new Float32Array(52 * 5);
  (function () {
    const fr = Math.fround, WLs = [192, 31], WA = [0.120, 0.033];
    const h3 = (a, b, c) => {
      let x = (Math.imul(a, 1664525) + 1013904223) >>> 0, y = (Math.imul(b, 1664525) + 1013904223) >>> 0, z = (Math.imul(c, 1664525) + 1013904223) >>> 0;
      x = (x + Math.imul(y, z)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0;
      x = (x ^ (x >>> 16)) >>> 0; y = (y ^ (y >>> 16)) >>> 0; z = (z ^ (z >>> 16)) >>> 0;
      x = (x + Math.imul(y, z)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0;
      return [fr(fr(x) / 4294967296), fr(fr(y) / 4294967296), fr(fr(z) / 4294967296)];
    };
    for (let c = 0; c < 2; c++) for (let i = 0; i < 26; i++) {
      const h = h3(i, c, 77), g = h3(i, c, 177), o = (c * 26 + i) * 5;
      const spread = 1.5 + 1.5 * c * 0.5, ang = 0.9 + (h[0] - 0.5) * spread + (g[2] - 0.5) * 0.6, m = 2 + 9.5 * h[1] * h[1];
      const kx = Math.round(m * Math.cos(ang)), kz = Math.round(m * Math.sin(ang)), kl2 = kx * kx + kz * kz;
      if (kl2 < 1) continue;
      const s = 2 * Math.PI / WLs[c];
      WV[o] = kx * s; WV[o + 1] = kz * s; WV[o + 2] = WA[c] * Math.pow(2 / Math.sqrt(kl2), 1.25) * (0.45 + h[2]) * 2.2;
      WV[o + 3] = Math.sqrt(9.81 * Math.sqrt(kl2) * s); WV[o + 4] = 2 * Math.PI * g[0];
    }
  })();
  function waveAts() { const x = F[_a0], z = F[_a1], t = F[_a2]; let h = 0; for (let o = 0; o < 260; o += 5) h += WV[o + 2] * Math.sin(WV[o] * x + WV[o + 1] * z - WV[o + 3] * t + WV[o + 4]); F[_r0] = h; }
  const HX = new Float32Array(16), HY = new Float32Array(16);
  for (let i = 0; i < 16; i++) { let f = 0.5, r = 0, k = i + 1; while (k) { r += f * (k & 1); k >>= 1; f *= 0.5; } HX[i] = r - 0.5; f = 1 / 3; r = 0; k = i + 1; while (k) { r += f * (k % 3); k = k / 3 | 0; f /= 3; } HY[i] = r - 0.5; }

  // ---------------- input ----------------
  const K_S = 1, K_W = 2, K_A = 4, K_D = 8;
  function keyBit(c) { return c === 'KeyS' || c === 'ArrowDown' ? K_S : c === 'KeyW' || c === 'ArrowUp' ? K_W : c === 'KeyA' ? K_A : c === 'KeyD' ? K_D : 0; }
  addEventListener('keydown', (e) => {
    const b = keyBit(e.code);
    if (b) { F[_keys] |= b; if (b & 3) F[_auto] = 0; e.preventDefault(); return; }
    if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
    if (e.code === 'Home') { F[_goal] = 0; F[_auto] = 0; e.preventDefault(); }
    else if (e.code === 'End') { F[_goal] = 1; F[_auto] = 0; e.preventDefault(); }
    else if (e.code === 'Space') { F[_auto] = F[_auto] === 1 ? 2 : F[_auto] === 2 ? 1 : (F[_d] < 0.5 ? 1 : 2); F[_goal] = F[_target]; e.preventDefault(); }
    else if (e.code === 'KeyV') { F[_straight] = F[_straight] ? 0 : 1; }
    else if (e.code === 'KeyC') { F[_mode] ^= 1; if (F[_mode]) F[_azGoal] = Math.round(F[_az] / (2 * Math.PI)) * 2 * Math.PI; }
  });
  addEventListener('keyup', (e) => { F[_keys] &= ~keyBit(e.code); });
  addEventListener('blur', () => { F[_keys] = 0; F[_drag] = 0; });
  addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 600 : 1;
    F[_goal] = Math.min(1, Math.max(0, F[_goal] + e.deltaY * k * 0.00042)); F[_auto] = 0;
  }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => { F[_drag] = 1; F[_lx] = e.clientX; F[_ly] = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
  canvas.addEventListener('pointermove', (e) => {
    if (!F[_drag]) return;
    const dx = e.clientX - F[_lx], dy = e.clientY - F[_ly]; F[_lx] = e.clientX; F[_ly] = e.clientY;
    F[_goal] = Math.min(1, Math.max(0, F[_goal] - dy / Math.max(200, innerHeight) * 0.55)); F[_azGoal] -= dx * 0.0045;
    if (dy !== 0) F[_auto] = 0;
  });
  const endDrag = () => { F[_drag] = 0; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  addEventListener('resize', resize);

  // ---------------- simulation ----------------
  function sim() {
    const dt = F[_dt];
    F[_time] += dt;
    if (F[_keys] & K_S) F[_goal] += 0.2 * dt;
    if (F[_keys] & K_W) F[_goal] -= 0.2 * dt;
    if (F[_auto] === 1) { F[_goal] += dt / 18.6; if (F[_goal] >= 1) F[_auto] = 0; }
    else if (F[_auto] === 2) { F[_goal] -= dt / 18.6; if (F[_goal] <= 0) F[_auto] = 0; }
    F[_goal] = Math.min(1, Math.max(0, F[_goal]));
    const mv = 0.34 * dt, dg = F[_goal] - F[_target];
    F[_target] += Math.max(-mv, Math.min(mv, dg));
    const om = 5.0;
    F[_vel] += (om * om * (F[_target] - F[_d]) - 2 * om * F[_vel]) * dt;
    F[_d] += F[_vel] * dt;
    if (F[_d] < 0) { F[_d] = 0; F[_vel] = 0; } else if (F[_d] > 1) { F[_d] = 1; F[_vel] = 0; }
    const ak = (F[_keys] & K_D ? 1 : 0) - (F[_keys] & K_A ? 1 : 0);
    F[_azKey] += (ak * 0.55 - F[_azKey]) * Math.min(1, dt * 5);
    F[_azGoal] += (F[_azKey] + (F[_mode] === 0 ? -0.10471975512 : 0)) * dt;
    F[_az] += (F[_azGoal] - F[_az]) * Math.min(1, dt * 6);
    F[_sb] += (F[_straight] - F[_sb]) * Math.min(1, dt * 2.5);
  }

  function updateUniforms() {
    const dt = F[_dt];
    UB.copyWithin(16, 0, 16);
    let cx, cy, cz, fx, fy, fz, wv = 0, tanY = Math.tan(21 * Math.PI / 180);
    if (F[_pose]) {
      cx = POSE[0]; cy = POSE[1]; cz = POSE[2];
      fx = POSE[3] - cx; fy = POSE[4] - cy; fz = POSE[5] - cz;
      const l = Math.sqrt(fx * fx + fy * fy + fz * fz); fx /= l; fy /= l; fz /= l;
      if (POSE[6] > 0) tanY = Math.tan(POSE[6] * Math.PI / 360);
    } else {
      F[_a0] = F[_d]; camYs(); cy = F[_r0];
      // straight mode holds the top-of-path distance and tilt all the way down; _sb eases between the two paths
      const sb = F[_sb] * F[_sb] * (3 - 2 * F[_sb]);
      F[_a0] = cy; keys(KR); const rad = F[_r0] + (RS - F[_r0]) * sb;
      keys(KP); const pit = (F[_r0] + (KP[0] - F[_r0]) * sb) * Math.PI / 180;
      const sa = Math.sin(F[_az]), ca = Math.cos(F[_az]), cp = Math.cos(pit);
      cx = sa * rad; cz = ca * rad;
      const ar = Math.min(1, Math.max(0, (Math.abs(cy) - 1.5) / 4.5));
      F[_a0] = cx; F[_a1] = cz; F[_a2] = F[_time]; waveAts(); wv = F[_r0] * (1 - ar * ar * (3 - 2 * ar)); cy += wv; fx = -sa * cp; fy = Math.sin(pit); fz = -ca * cp;
    }
    let rx = -fz, rz = fx; const rl = Math.sqrt(rx * rx + rz * rz); rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const j = F[_frame] & 15;
    UB[0] = cx; UB[1] = cy; UB[2] = cz; UB[3] = F[_time];
    UB[4] = rx; UB[5] = 0; UB[6] = rz; UB[7] = tanY * W / H;
    UB[8] = ux; UB[9] = uy; UB[10] = uz; UB[11] = tanY;
    UB[12] = fx; UB[13] = fy; UB[14] = fz; UB[15] = F[_frame];
    if (F[_reset]) UB.copyWithin(16, 0, 16);
    UB[32] = W; UB[33] = H; UB[34] = 1 / W; UB[35] = 1 / H;
    UB[36] = HX[j]; UB[37] = HY[j]; UB[38] = LENS; UB[39] = dt;
    // lens wetness and plunge bookkeeping
    const rel = cy - wv;
    if (rel + LENS * 0.3 < 0) { F[_wet] = 1; F[_emerge] = 0; } else { F[_emerge] += dt; F[_wet] *= Math.exp(-dt / 2.6); }
    if (F[_lastY] >= 0 && rel < 0) { F[_px] = cx + fx * 1.6; F[_py] = -0.15; F[_pz] = cz + fz * 1.6; F[_plungeAge] = 0; } else F[_plungeAge] += dt;
    F[_lastY] = rel;
    UB[40] = F[_d]; UB[41] = F[_wet]; UB[42] = F[_emerge]; UB[43] = DW;
    UB[44] = dt > 0 ? Math.min(2, (1 / 120) / dt) : 0; UB[45] = F[_mode]; UB[46] = F[_hud]; UB[47] = F[_reset];
    UB[48] = F[_px]; UB[49] = F[_py]; UB[50] = F[_pz]; UB[51] = F[_plungeAge];
  }

  // ---------------- frame ----------------
  const submitList = [null];
  let wantCap = 0;
  function draw(pe, pipe, g0, g1) { pe.setPipeline(pipe); if (g0) pe.setBindGroup(0, g0); pe.setBindGroup(1, g1); pe.draw(3); pe.end(); }
  function render() {
    updateUniforms();
    device.queue.writeBuffer(ubuf, 0, UB);
    const r = R, k = F[_frame] & 1;
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass(twCompute);
    cp.setPipeline(pWaves); cp.setBindGroup(0, gWaves0); cp.setBindGroup(1, gWaves1); cp.dispatchWorkgroups(32, 32, 3);
    cp.setPipeline(pMip);
    for (let l = 0; l < WMIPS - 1; l++) { cp.setBindGroup(1, gMip[l]); const n = Math.max(1, 16 >> l); cp.dispatchWorkgroups(n, n, 3); }
    cp.end();
    r.pScene.timestampWrites = TW[1]; draw(enc.beginRenderPass(r.pScene), pScene, gU.scene, gScene);
    r.pTaa[k].timestampWrites = TW[2]; draw(enc.beginRenderPass(r.pTaa[k]), pTaa, gU.taa, r.gTaa[k]);
    r.pPart.timestampWrites = TW[3];
    const pp = enc.beginRenderPass(r.pPart); pp.setPipeline(pPart); pp.setBindGroup(0, gU.part); pp.setBindGroup(1, r.gPart[k]); pp.draw(4, NPART); pp.end();
    r.pMB.timestampWrites = TW[4]; draw(enc.beginRenderPass(r.pMB), pMB, gU.mb, r.gMB);
    for (let i = 0; i < NB; i++) draw(enc.beginRenderPass(r.pDn[i]), pDown, null, r.gDn[i]);
    for (let i = NB - 2; i >= 0; i--) draw(enc.beginRenderPass(r.pUp[i]), pUp, null, r.gUp[i]);
    r.pExpo[k].timestampWrites = TW[5]; draw(enc.beginRenderPass(r.pExpo[k]), pExpo, gU.expo, r.gExpo[k]);
    const ct = ctx.getCurrentTexture();
    r.pFin.colorAttachments[0].view = ct.createView(); r.pFin.timestampWrites = TW[6];
    draw(enc.beginRenderPass(r.pFin), pFinal, gU.fin, r.gFin[k]);
    if (wantCap) { r.capSrc.texture = ct; enc.copyTextureToBuffer(r.capSrc, r.capDst, r.capSize); }
    let qb = null;
    if (qs && qFree.length) { qb = qFree.pop(); enc.resolveQuerySet(qs, 0, NQ, qRes, 0); enc.copyBufferToBuffer(qRes, 0, qb, 0, NQ * 8); }
    submitList[0] = enc.finish();
    device.queue.submit(submitList);
    if (qb) readQueries(qb, F[_time], UB[1]);
    F[_frame]++; F[_reset] = 0;
  }
  function readQueries(qb, t, y) {
    qb.mapAsync(GPUMapMode.READ).then(() => {
      const a = new BigInt64Array(qb.getMappedRange());
      const n = log.n % LOGN;
      log.t[n] = t; log.y[n] = y; log.gpu[n] = Number(a[13] - a[0]) / 1e6;
      const o = n * 6;
      log.parts[o] = Number(a[1] - a[0]) / 1e6; log.parts[o + 1] = Number(a[3] - a[2]) / 1e6; log.parts[o + 2] = Number(a[5] - a[4]) / 1e6;
      log.parts[o + 3] = Number(a[7] - a[6]) / 1e6; log.parts[o + 4] = Number(a[9] - a[8]) / 1e6; log.parts[o + 5] = Number(a[13] - a[10]) / 1e6;
      log.cpu[n] = F[_dt] * 1000; log.n++;
      qb.unmap(); qFree.push(qb);
    });
  }

  // The frame functions take no number arguments and keep no numbers in closure variables: everything goes through F,
  // so there is no boxed double to allocate between them.
  function clock(now) {
    F[_dt] = F[_last] > 0 ? Math.min(0.05, Math.max(0.001, (now - F[_last]) * 0.001)) : 1 / 60;
    F[_last] = now;
  }
  function loop(now) {
    clock(now); sim(); render();
    requestAnimationFrame(loop);
  }
  // Warm the JIT before the first frame. Until the optimising tier takes over, every double intermediate in
  // sim/updateUniforms is a heap number; a few round trips of the real camera path (keys, both auto directions,
  // both camera modes, the fixed-pose branch) get that out of the way during loading. State is restored after.
  function warm() {
    const f0 = F.slice(), u0 = UB.slice();
    POSE[0] = 60; POSE[1] = 5; POSE[2] = 180; POSE[6] = 40;
    for (let i = 0, now = 16; i < 60000; i++, now += 16.6) {
      const ph = (i / 2500) | 0;
      if (i % 2500 === 0) { F[_auto] = (ph & 1) + 1; F[_mode] = (ph >> 1) & 1; F[_keys] = ph % 5 === 4 ? 1 << (ph & 3) : 0; F[_pose] = ph % 7 === 6 ? 1 : 0; F[_straight] = (ph >> 2) & 1; F[_reset] = ph & 1; }
      clock(now); sim(); updateUniforms(); F[_frame]++;
    }
    F.set(f0); UB.set(u0); POSE.fill(0);
  }

  // ---------------- hooks for the capture / test harness ----------------
  let sdfCpu = null;
  const f16 = (h) => { const e = (h >> 10) & 31, m = h & 1023, s = h & 0x8000 ? -1 : 1; return s * (e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1 + m / 1024) * 2 ** (e - 15)); };
  window.__demo = {
    S, log, size: () => [W, H], straightR: RS,
    async step(dt, cap, url) {
      wantCap = cap ? 1 : 0;
      F[_dt] = dt; sim(); render();
      if (this.afterRender) this.afterRender();
      if (cap) {
        await R.capBuf.mapAsync(GPUMapMode.READ);
        const src = new Uint8Array(R.capBuf.getMappedRange());
        let body = src;
        if (R.capRow !== W * 4) { body = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) body.set(src.subarray(y * R.capRow, y * R.capRow + W * 4), y * W * 4); }
        await fetch(url, { method: 'POST', body });
        R.capBuf.unmap();
      } else await device.queue.onSubmittedWorkDone();
    },
    setPose(p) { if (p) { POSE.set(p); S.pose = 1; } else S.pose = 0; S.reset = 1; },
    state() { return { d: S.d, goal: S.goal, target: S.target, az: S.az, mode: S.mode, auto: S.auto, straight: S.straight, cam: [UB[0], UB[1], UB[2]], rel: F[_lastY], fwd: [UB[12], UB[13], UB[14]], time: S.time, frame: S.frame, fmt: FMT }; },
    camAt(d, az) { const y = camY(d), r = key(KR, y); return [Math.sin(az) * r, y, Math.cos(az) * r, key(KP, y)]; },
    async loadSdf() {
      const row = 256 * 2, buf = device.createBuffer({ size: row * 320 * 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: sdfTex }, { buffer: buf, bytesPerRow: row, rowsPerImage: 320 }, [256, 320, 256]);
      device.queue.submit([enc.finish()]); await buf.mapAsync(GPUMapMode.READ);
      const h = new Uint16Array(buf.getMappedRange()); sdfCpu = new Float32Array(h.length);
      for (let i = 0; i < h.length; i++) sdfCpu[i] = f16(h[i]);
      buf.unmap(); buf.destroy();
      let mx = 0, cnt = 0, big = 0;
      for (let z = 1; z < 255; z += 2) for (let y = 1; y < 319; y += 2) for (let x = 1; x < 255; x += 2) {
        const i = x + 256 * (y + 320 * z), v = sdfCpu[i];
        if (Math.abs(v) > 6) continue;
        const g = Math.hypot(sdfCpu[i + 1] - sdfCpu[i - 1], sdfCpu[i + 256] - sdfCpu[i - 256], sdfCpu[i + 81920] - sdfCpu[i - 81920]) / (2 * 1.125);
        mx = Math.max(mx, g); cnt++; if (g > 1) big++;
      }
      return { maxGrad: mx, fracOver1: big / cnt };
    },
    // conservative distance (metres) from a point to the ice; large positive outside the volume
    iceDist(x, y, z) {
      const fx = (x + 144) / 288 * 256 - 0.5, fy = (y + 272) / 372 * 320 - 0.5, fz = (z + 144) / 288 * 256 - 0.5;
      const qx = Math.min(142.5, Math.max(-142.5, x)), qy = Math.min(98.5, Math.max(-270.5, y)), qz = Math.min(142.5, Math.max(-142.5, z));
      if (qx !== x || qy !== y || qz !== z) return Math.hypot(x - qx, y - qy, z - qz) + Math.max(0, this.iceDist(qx, qy, qz));
      const x0 = fx | 0, y0 = fy | 0, z0 = fz | 0, tx = fx - x0, ty = fy - y0, tz = fz - z0;
      const at = (a, b, c) => sdfCpu[a + 256 * (b + 320 * c)];
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(at(x0, y0, z0), at(x0 + 1, y0, z0), tx), l(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx), ty),
        l(l(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx), l(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx), ty), tz) / 0.5;
    },
  };
  if (Q.has('nohud')) F[_hud] = 0;
  resize();
  warm();
  bar.style.display = 'none';
  window.__demo.ready = true;
  if (!MANUAL) requestAnimationFrame(loop);
})();
