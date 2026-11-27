// ---- main scene: ray-marched iceberg, ocean, sky, underwater medium ----
@group(1) @binding(0) var sdfT: texture_3d<f32>;
@group(1) @binding(1) var lightT: texture_3d<f32>;
@group(1) @binding(2) var noiseT: texture_3d<f32>;
@group(1) @binding(3) var waveT: texture_2d_array<f32>;
@group(1) @binding(4) var sC: sampler;
@group(1) @binding(5) var sR: sampler;

const WL = vec3f(192., 31., 5.3);
const CS = 16.;          // floating-ice cell size
const SKYAMB = vec3f(0.115, 0.185, 0.36);
var<private> gEmis: vec3f;
var<private> gSkyFx: f32 = 1.;

// ---------------- ocean ----------------
fn waveS(xz: vec2f, fp: f32) -> vec4f {
  var r = vec4f(0.);
  for (var c = 0; c < 3; c++) {
    let lod = log2(max(fp * 256. / WL[c], 1.));
    if (lod < 6.) {
      r += textureSampleLevel(waveT, sR, xz / WL[c], c, lod) * (1. - smoothstep(4.5, 6., lod));
    }
  }
  return r;
}
fn waveLow(xz: vec2f) -> f32 { return textureSampleLevel(waveT, sR, xz / WL.x, 0, 2.).x; }
fn fpAt(t: f32, rdy: f32, pixA: f32) -> f32 { return t * pixA * 0.75 * pow(max(abs(rdy), 0.03), -0.3); }

fn hitWater(ro: vec3f, rd: vec3f, tmax: f32, pixA: f32) -> f32 {
  if (abs(ro.y) > 2.2) {
    if (ro.y * rd.y >= 0.) { return -1.; }
    var t = -ro.y / rd.y;
    if (t > 60000.) { return -1.; }
    for (var i = 0; i < 3; i++) {
      let p = ro + rd * t;
      t += (waveS(p.xz, fpAt(t, rd.y, pixA)).x - p.y) / rd.y;
    }
    if (t > tmax || t < 0.) { return -1.; }
    return t;
  }
  var pf = ro.y - waveS(ro.xz, 0.).x;
  let sg = sign(pf);
  var pt = 0.; var t = 0.;
  for (var i = 0; i < 30; i++) {
    t = t * 1.3 + 0.035;
    if (t > tmax) { return -1.; }
    let p = ro + rd * t;
    let f = p.y - waveS(p.xz, fpAt(t, rd.y, pixA)).x;
    if (f * sg < 0.) {
      var a = pt; var fa = pf; var b = t; var fb = f; var m = t;
      for (var k = 0; k < 5; k++) {
        m = a + (b - a) * fa / (fa - fb);
        let q = ro + rd * m;
        let fm = q.y - waveS(q.xz, fpAt(m, rd.y, pixA)).x;
        if (fm * sg < 0.) { b = m; fb = fm; } else { a = m; fa = fm; }
      }
      return m;
    }
    if (f * sg > 1.6 && rd.y * sg >= 0.) { return -1.; }
    pt = t; pf = f;
  }
  if (ro.y * rd.y < 0.) { let tp = -ro.y / rd.y; if (tp > t && tp < tmax) { return tp; } }
  return -1.;
}

// ---------------- ice ----------------
fn sdTex(p: vec3f) -> f32 { return textureSampleLevel(sdfT, sC, (p - VMIN) / (VMAX - VMIN), 0.).r; }
fn detail(p: vec3f) -> f32 {
  let under = smoothstep(1., -4., p.y);
  let rough = smoothstep(-0.25, 0.3, textureSampleLevel(noiseT, sR, p * (1. / 170.) + 0.37, 0.).a);
  let n1 = textureSampleLevel(noiseT, sR, p * (1. / 26.), 0.).r;
  var d = mix((0.3 - abs(n1)) * 1.25, n1 * 0.3, under) * mix(0.3, 1., rough);
  let ws = mix(1., 0.42, under);
  d += (textureSampleLevel(noiseT, sR, p * vec3f(1. / 19., 1. / 27., 1. / 19.) * ws, 0.).b - 0.45) * mix(0.16, 0.85, under);
  d += textureSampleLevel(noiseT, sR, p * (1. / 97.) + 0.5, 0.).g * 1.1 * under;
  return d;
}
fn fineFade(t: f32, pixA: f32, p: vec3f) -> vec3f {
  let f = t * pixA;
  return vec3f(1. - smoothstep(0.2, 0.6, f), 1. - smoothstep(0.066, 0.2, f), 1. - smoothstep(0.022, 0.066, f)) * mix(1., 0.3, smoothstep(1., -4., p.y));
}
// ridged octaves: sharp creases that stay crisp close up
fn detailFine(p: vec3f, fade: vec3f) -> f32 {
  return (0.3 - abs(textureSampleLevel(noiseT, sR, p * (1. / 9.3), 0.).g)) * 0.20 * fade.x
       + (0.3 - abs(textureSampleLevel(noiseT, sR, p * (1. / 3.1) + 0.4, 0.).r)) * 0.07 * fade.y
       + (0.3 - abs(textureSampleLevel(noiseT, sR, p * (1. / 1.07) + 0.7, 0.).g)) * 0.022 * fade.z;
}
fn boxClip(ro: vec3f, rd: vec3f, t0: f32, t1: f32) -> vec2f {
  let inv = 1. / rd;
  let a = (VMIN + 1.2 - ro) * inv; let b = (VMAX - 1.2 - ro) * inv;
  let mn = min(a, b); let mx = max(a, b);
  return vec2f(max(max(mn.x, mn.y), max(mn.z, t0)), min(min(mx.x, mx.y), min(mx.z, t1)));
}
fn marchIce(ro: vec3f, rd: vec3f, t0: f32, t1: f32, steps: i32, pixA: f32) -> f32 {
  let tr = boxClip(ro, rd, t0, t1);
  if (tr.x >= tr.y) { return -1.; }
  var t = tr.x;
  for (var i = 0; i < steps; i++) {
    let p = ro + rd * t;
    var d = sdTex(p);
    if (d > 4.) { t += d - 1.6; }
    else {
      d -= detail(p);
      if (d < 0.01 + t * pixA * 0.5) { return t; }
      t += d * 0.72;
    }
    if (t > tr.y) { return -1.; }
  }
  return t;
}
fn iceNormal(p: vec3f, t: f32, pixA: f32, fine: bool) -> vec3f {
  let k = vec2f(1., -1.);
  let e = 1.25;
  let g = k.xyy * sdTex(p + k.xyy * e) + k.yyx * sdTex(p + k.yyx * e) + k.yxy * sdTex(p + k.yxy * e) + k.xxx * sdTex(p + k.xxx * e);
  let n = normalize(g + 1e-6);
  let h = clamp(t * pixA * 1.5, 0.05, 0.6);
  var dg: vec3f;
  if (fine) {
    let fade = fineFade(t, pixA, p);
    dg = k.xyy * (detail(p + k.xyy * h) + detailFine(p + k.xyy * h, fade)) + k.yyx * (detail(p + k.yyx * h) + detailFine(p + k.yyx * h, fade))
       + k.yxy * (detail(p + k.yxy * h) + detailFine(p + k.yxy * h, fade)) + k.xxx * (detail(p + k.xxx * h) + detailFine(p + k.xxx * h, fade));
  } else {
    dg = k.xyy * detail(p + k.xyy * h) + k.yyx * detail(p + k.yyx * h) + k.yxy * detail(p + k.yxy * h) + k.xxx * detail(p + k.xxx * h);
  }
  dg = dg / (4. * h);
  dg -= n * dot(dg, n);
  return normalize(n * FS - dg);
}
fn lightV(p: vec3f) -> vec4f {
  let q = (p - VMIN) / (VMAX - VMIN);
  let e = min(q, 1. - q);
  let w = sat(min(e.x, min(e.y, e.z)) * 24.);
  if (w <= 0.) { return vec4f(1., 1., 0.45, 0.7); }
  return mix(vec4f(1., 1., 0.45, 0.7), textureSampleLevel(lightT, sC, q, 0.), w);
}

// ---------------- floating ice ----------------
fn chunkCell(cell: vec2f, ro: vec3f, rd: vec3f) -> vec4f {
  let ci = vec3i(i32(cell.x), i32(cell.y), 17);
  let h = h3(ci);
  let c = (cell + 0.3 + 0.4 * h.xy) * CS;
  let rc = length(c);
  let prob = mix(0.2, 0.03, smoothstep(90., 330., rc));
  if (h.z > prob || rc < 70. || rc > 335. || (rc > 105. && rc < 225.)) { return vec4f(-1.); }
  let g = h3(ci + vec3i(0, 0, 40));
  let r = 0.55 + 2.1 * g.x * g.x;
  let rs = vec3f(r * (1. + 0.8 * g.y), r * 0.45, r * (0.7 + 0.5 * g.z));
  let ang = g.z * 6.283; let ca = cos(ang); let sa = sin(ang);
  let ctr = vec3f(c.x, waveLow(c) - 0.05 * r, c.y);
  let ol = ro - ctr;
  let o = vec3f(ca * ol.x + sa * ol.z, ol.y, -sa * ol.x + ca * ol.z) / rs;
  let d = vec3f(ca * rd.x + sa * rd.z, rd.y, -sa * rd.x + ca * rd.z) / rs;
  let A = dot(d, d); let B = dot(o, d); let C = dot(o, o) - 2.0;
  let disc = B * B - A * C;
  if (disc < 0.) { return vec4f(-1.); }
  let sq = sqrt(disc);
  var tN = (-B - sq) / A; var tF = (-B + sq) / A;
  var nN = o + d * tN;
  // angular block: intersection of random half-spaces (flat top, a keel below)
  for (var j = 0; j < 10; j++) {
    let hm = h3(ci + vec3i(j, 0, 90)) * 2. - 1.;
    var m = normalize(vec3f(hm.x, hm.y * 0.55, hm.z));
    var kk = 0.5 + 0.38 * fract(hm.x * 7.3 + 0.5);
    if (j == 0) { m = normalize(vec3f(hm.x * 0.12, 1., hm.z * 0.12)); kk = 0.42 + 0.2 * fract(hm.y * 5.1); }
    if (j == 1) { m = normalize(vec3f(hm.x * 0.3, -1., hm.z * 0.3)); kk = 0.75; }
    let den = dot(m, d); let num = kk - dot(m, o);
    if (den > 0.) { tF = min(tF, num / den); }
    else if (den < 0.) { let tc = num / den; if (tc > tN) { tN = tc; nN = m; } }
    else if (num < 0.) { return vec4f(-1.); }
  }
  if (tN >= tF || tN <= 0.) { return vec4f(-1.); }
  let nl = nN / rs;
  return vec4f(tN, normalize(vec3f(ca * nl.x - sa * nl.z, nl.y, sa * nl.x + ca * nl.z)));
}
fn traceChunks(ro: vec3f, rd: vec3f, tmax: f32) -> vec4f {
  var t0 = 0.; var t1 = tmax;
  if (abs(rd.y) > 1e-5) {
    let a = (-2.6 - ro.y) / rd.y; let b = (2.6 - ro.y) / rd.y;
    t0 = max(t0, min(a, b)); t1 = min(t1, max(a, b));
  } else if (abs(ro.y) > 2.6) { return vec4f(-1.); }
  if (t0 >= t1) { return vec4f(-1.); }
  let d2 = rd.xz; let o2 = ro.xz;
  let A = dot(d2, d2);
  if (A < 1e-7) { return vec4f(-1.); }
  let B = dot(o2, d2); let C = dot(o2, o2) - 345. * 345.;
  let disc = B * B - A * C;
  if (disc < 0.) { return vec4f(-1.); }
  let sq = sqrt(disc);
  t0 = max(t0, (-B - sq) / A); t1 = min(t1, (-B + sq) / A);
  if (t0 >= t1) { return vec4f(-1.); }
  let p = o2 + d2 * (t0 + 1e-3);
  var cell = floor(p / CS);
  let stp = sign(d2);
  let inv = 1. / max(abs(d2), vec2f(1e-6));
  var tM = t0 + ((cell + max(stp, vec2f(0.))) * CS - p) * stp * inv;
  for (var i = 0; i < 40; i++) {
    let r = chunkCell(cell, ro, rd);
    if (r.x > 0. && r.x < tmax) { return r; }
    if (tM.x < tM.y) { if (tM.x > t1) { break; } cell.x += stp.x; tM.x += CS * inv.x; }
    else { if (tM.y > t1) { break; } cell.y += stp.y; tM.y += CS * inv.y; }
  }
  return vec4f(-1.);
}

// ---------------- sky ----------------
fn skyBase(rd: vec3f) -> vec3f {
  let h = max(rd.y, 0.);
  let hz = normalize(rd.xz + vec2f(1e-5));
  let az = dot(hz, normalize(vec2f(-0.86, -0.5)));
  let g = mix(0.30, 1., pow(0.5 + 0.5 * az, 2.));
  var col = vec3f(0.0035, 0.0065, 0.017);
  col += vec3f(0.016, 0.085, 0.50) * g * exp(-h * 10.);
  col += vec3f(0.006, 0.024, 0.10) * (0.4 + 0.6 * g) * exp(-h * 3.2);
  let md = dot(rd, LDIR);
  col += MOONC * (0.05 * pow(sat(md), 24.) + 0.25 * pow(sat(md), 600.) * gSkyFx);
  let mwd = dot(rd, vec3f(0.42, 0.55, -0.72));
  let mwn = textureSampleLevel(noiseT, sR, rd * 1.7 + 0.3, 0.);
  col += gSkyFx * vec3f(0.010, 0.013, 0.021) * exp(-mwd * mwd * 14.) * sat(0.55 + 0.9 * mwn.r + 0.5 * mwn.g) * smoothstep(0.0, 0.25, rd.y);
  return col;
}
fn starLayer(rd: vec3f, n: f32, sig: f32, seed: i32, pw: f32, exist: f32) -> vec3f {
  let a = abs(rd);
  var uv: vec2f; var face: i32; var ma: f32;
  if (a.x >= a.y && a.x >= a.z) { uv = rd.yz / a.x; face = select(1, 0, rd.x > 0.); ma = a.x; }
  else if (a.y >= a.z) { uv = rd.xz / a.y; face = select(3, 2, rd.y > 0.); ma = a.y; }
  else { uv = rd.xy / a.z; face = select(5, 4, rd.z > 0.); ma = a.z; }
  let gp = uv * n;
  let id = floor(gp);
  let h = h3(vec3i(i32(id.x) + 4096 * face, i32(id.y), seed));
  let g = h3(vec3i(i32(id.x) + 4096 * face, i32(id.y), seed + 50));
  if (g.y > exist) { return vec3f(0.); }
  let sp = (id + 0.12 + 0.76 * h.xy) / n;
  let sd = normalize(vec3f(sp, 1.));
  let pd = normalize(vec3f(uv, 1.));
  let d2 = dot(pd - sd, pd - sd);
  let mag = pow(h.z, pw);
  let s = sig * (1. + 0.9 * mag);
  let tint = mix(vec3f(0.74, 0.86, 1.), vec3f(1., 0.95, 0.88), g.x * g.x * g.x);
  return tint * mag * exp(-d2 / (s * s)) * (0.00055 * 0.00055) / (sig * sig);
}
fn stars(rd: vec3f, sig0: f32) -> vec3f {
  if (rd.y < -0.02) { return vec3f(0.); }
  let sig = max(sig0, 0.00042);
  let ext = smoothstep(0.0, 0.16, rd.y) * (1. - smoothstep(0.0025, 0.007, sig0));
  let r1 = vec3f(0.8*rd.x - 0.6*rd.z, rd.y, 0.6*rd.x + 0.8*rd.z);
  let r2 = vec3f(rd.x, 0.936*rd.y - 0.352*rd.z, 0.352*rd.y + 0.936*rd.z);
  let mwd = dot(rd, vec3f(0.42, 0.55, -0.72));
  let dens = 0.55 + 1.1 * exp(-mwd * mwd * 14.);
  return (starLayer(rd, 11., sig, 3, 3.6, 0.6) * 18. + starLayer(r1, 37., sig, 11, 3.2, 0.4 * dens) * 2.8 + starLayer(r2, 96., sig, 23, 2.6, 0.34 * dens) * 0.6) * ext;
}
fn moonDisc(rd: vec3f, blur: f32) -> vec3f {
  let ang = acos(clamp(dot(rd, LDIR), -1., 1.));
  let r = 0.011;
  let e = max(blur, 0.0007);
  let disc = 1. - smoothstep(r - e, r + e, ang);
  let q = rd * 38.;
  let mare = 0.78 + 0.22 * sat(0.5 + 1.6 * gnoise(q + 3.));
  return MOONC * disc * mare * 9. * min(1., (r * r) / (e * e + r * r) * 2.);
}
fn skyFull(rd: vec3f, sig: f32) -> vec3f {
  var d = rd; d.y = max(d.y, 0.0);
  return skyBase(d) + stars(d, sig) + moonDisc(d, sig);
}

// ---------------- underwater light ----------------
fn waterL() -> vec3f { return -refract(-LDIR, vec3f(0., 1., 0.), 0.75); }
fn caustic(p: vec3f, blur: f32) -> f32 {
  let depth = max(-p.y, 0.);
  let lw = waterL();
  let s = p.xz + lw.xz * (depth / lw.y);
  let z = min(depth, 70.);
  let fp = (0.03 + z * 0.045) * blur;
  let l1 = textureSampleLevel(waveT, sR, s / WL.y, 1, log2(max(fp * 256. / WL.y, 1.))).w;
  let l0 = textureSampleLevel(waveT, sR, s / WL.x, 0, log2(max(fp * 256. / WL.x, 1.))).w;
  let f = 1. + 0.25 * z * (l1 + l0);
  let c = min(1. / max(abs(f), 0.3), 2.6);
  return mix(1., c, 0.42 * sat(depth * 0.5) * exp(-depth * 0.012));
}
fn downAmb(depth: f32) -> vec3f { let c = SKYAMB * 0.55 * exp(-KD * depth); return mix(vec3f(dot(c, vec3f(0.25, 0.5, 0.25))), c, 0.42) + vec3f(0.0050, 0.0070, 0.0100); }
fn downMoon(depth: f32) -> vec3f { return MOONC * 0.85 * exp(-KD * depth * 1.3); }

struct Med { s: vec3f, tr: vec3f };
fn waterMedium(ro: vec3f, rd: vec3f, tmax: f32, jit: f32, shafts: bool) -> Med {
  let tEnd = min(tmax, 320.);
  let k = 0.014;
  let span = 1. - exp(-k * tEnd);
  var S = vec3f(0.);
  let lw = waterL();
  let cosT = dot(rd, lw);
  let g = 0.72;
  let phase = (1. - g * g) / pow(1. + g * g - 2. * g * cosT, 1.5) * 0.25 + 0.35;
  let N = select(6, 12, shafts);
  var tp = 0.;
  for (var i = 0; i < N; i++) {
    let x = (f32(i) + jit) / f32(N);
    let t = -log(1. - x * span) / k;
    let x1 = (f32(i) + 1.) / f32(N);
    let tn = -log(1. - x1 * span) / k;
    let p = ro + rd * t;
    let depth = max(-p.y, 0.);
    var L = downAmb(depth);
    if (shafts) {
      let lv = lightV(p);
      L = L * (0.35 + 0.65 * lv.g) + downMoon(depth) * lv.r * mix(1., caustic(p, 3.5), 0.9) * phase * 0.6;
    } else {
      L += downMoon(depth) * 0.4;
    }
    S += exp(-SIGT * t) * L * (tn - tp);
    tp = tn;
  }
  return Med(S * vec3f(0.00022, 0.00060, 0.00110), exp(-SIGT * tmax));
}

// ---------------- shading ----------------
fn ggx(nh: f32, a: f32) -> f32 { let a2 = a * a; let d = nh * nh * (a2 - 1.) + 1.; return a2 / (PI * d * d); }
fn shadeIce(p: vec3f, n: vec3f, rd: vec3f, t: f32, pixA: f32, lv: vec4f, wh: f32, chunk: bool) -> vec3f {
  let hgt = p.y - wh;
  let ndv = sat(dot(n, -rd));
  let lowN = textureSampleLevel(noiseT, sR, p * (1. / 170.) + 0.37, 0.);
  let rough = smoothstep(-0.25, 0.3, lowN.a);
  // ---- above water ----
  var above = vec3f(0.);
  if (hgt > -0.6) {
    let wet = smoothstep(1.7, 0.15, hgt);
    let snow = sat(rough * 0.8 + smoothstep(0.55, 0.9, n.y) * 0.7) * (1. - wet);
    let band = smoothstep(0.25, 0.6, textureSampleLevel(noiseT, sR, vec3f(dot(p, vec3f(0.02, 0.055, 0.012)), 0.3, 0.7) , 0.).r);
    let dv = detail(p);
    let fv = detailFine(p, fineFade(t, pixA, p));
    let cav = smoothstep(-0.55, 0.35, dv) * (0.72 + 0.28 * smoothstep(-0.06, 0.05, fv));
    // hairline fractures and faint strata
    var alb = mix(vec3f(0.60, 0.80, 0.93), vec3f(0.90, 0.95, 0.985), snow);
    alb = mix(alb, vec3f(0.40, 0.68, 0.90), band * (1. - snow) * 0.55);
    alb *= mix(1., 0.62, wet);
    let ndl = dot(n, LDIR);
    let wrap = sat((ndl + 0.14) / 1.14);
    let direct = MOONC * 2.0 * wrap * wrap * lv.r;
    let skyUp = mix(vec3f(0.02, 0.035, 0.07), SKYAMB, n.y * 0.5 + 0.5);
    let hz = normalize(n.xz + vec2f(1e-4));
    let glow = vec3f(0.02, 0.06, 0.20) * sat(0.5 + 0.5 * dot(hz, normalize(vec2f(-0.86, -0.5)))) * (1. - abs(n.y));
    let amb = (skyUp * 1.5 + glow) * (0.25 + 0.75 * lv.g) * mix(0.45, 1.08, cav) * mix(vec3f(1.), vec3f(0.5, 0.82, 1.2), sat((1. - cav) * 0.8 + (1. - lv.g) * 0.6) * 0.5);
    // light bleeding through thin ice
    let back = pow(sat(dot(rd, LDIR) * 0.5 + 0.5), 2.);
    let thinK = lv.b * 0.85 + lv.a * 0.22;
    let sss = vec3f(0.08, 0.60, 0.90) * MOONC * thinK * (0.4 + 1.5 * back) * (1. - 0.6 * wrap * lv.r) * mix(1., 0.6, snow);
    let hv = normalize(LDIR - rd);
    let ro_ = mix(0.20, 0.62, snow) * mix(1., 0.45, wet);
    let fr = mix(0.03, 0.09, wet) + 0.97 * pow(1. - ndv, 5.);
    let spec = MOONC * min(ggx(sat(dot(n, hv)), ro_ * ro_), 7.) * sat(ndl) * lv.r * 0.04 * mix(1., 2.2, wet);
    var rr = reflect(rd, n); rr.y = abs(rr.y);
    let env = skyBase(rr) * fr * lv.g * (1. - snow * 0.7) * 2.2 * mix(0.6, 1., cav);
    above = alb * (direct + amb) + sss + spec + env;
  }
  // ---- below water ----
  var below = vec3f(0.);
  if (hgt < 0.6) {
    let depth = max(-p.y, 0.);
    let lw = waterL();
    let ca = caustic(p, 1.);
    let ea = downAmb(depth) * (0.2 + 0.8 * lv.g) * pow(0.53 + 0.47 * n.y, 2.4) * 1.7;
    let em = downMoon(depth) * lv.r * ca * sat(dot(n, lw) * 0.8 + 0.2);
    let alb = mix(vec3f(0.24, 0.29, 0.35), vec3f(0.32, 0.36, 0.41), rough * 0.5) * select(1., 2., chunk);
    let body = mix(vec3f(0.01, 0.06, 0.085), vec3f(0.10, 0.34, 0.42), select(0., 1., chunk)) * (downAmb(depth) + downMoon(depth) * 0.5) * (lv.a * 0.9 + lv.b * 0.6);
    let rim = pow(1. - ndv, 3.) * (downAmb(depth) * 0.55 + vec3f(0.004, 0.008, 0.016));
    below = alb * (ea * 2.4 + em * 1.6) + body + rim * 1.2 + select(vec3f(0.), downAmb(depth) * 0.6, chunk);
    if (!chunk) {
      let v = veinG(p);
      let taper = veinTaper(v.y, p.y);
      if (taper > 0.002) {
        // distance to the fissure measured along the surface, so grazing sheets cannot smear into blotches
        let t1 = normalize(cross(n, vec3f(0.31, 0.9, 0.12))); let t2 = cross(n, t1);
        let gs = max(length(vec2f(veinG(p + t1 * 1.3).x - v.x, veinG(p + t2 * 1.3).x - v.x)) / 1.3, 0.006);
        let dist = abs(v.x) / gs;
        let wv = 0.22 + 0.85 * taper * (0.55 + 0.45 * sin(p.y * 0.21 + v.y * 31.)) + t * pixA * 0.8;
        let seg = 0.25 + 0.75 * smoothstep(-0.3, 0.1, gnoise(p * 0.11 + 31.));
        let core = seg * sat(taper * 4.) * (1. - smoothstep(wv * 0.35, wv * 1.15, dist));
        below *= 1. - 0.7 * sat(taper * 3.) * (1. - smoothstep(wv, wv * 4.5, dist));
        // hairline cracks branching off the main fissure
        let c2 = abs(gnoise(p * 0.085 + vec3f(5., 9., 2.))) / 0.085;
        let crk = (1. - smoothstep(0.03 + t * pixA, 0.08 + t * pixA * 2., c2 * 0.6)) * exp(-dist * 0.4) * taper;
        let hot = seg * sat(taper * 4.) * (1. - smoothstep(0., wv * 0.55, dist));
        let halo = taper * (exp(-dist * 0.55) * 0.6 + exp(-dist * 0.12) * 0.4);
        let flick = 0.8 + 0.2 * sin(u.cam.w * 0.8 + p.y * 0.13 + v.y * 20.);
        gEmis = (vec3f(1.0, 0.36, 0.045) * core * 0.75 + vec3f(1.0, 0.72, 0.30) * hot * 1.1 + vec3f(1.0, 0.45, 0.08) * crk * 0.3 + alb * vec3f(1.0, 0.42, 0.08) * halo * 0.85) * flick * smoothstep(0.25, -0.25, hgt);
      }
    }
  }
  return mix(below, above, smoothstep(-0.25, 0.25, hgt));
}

struct Hit { t: f32, n: vec3f, chunk: bool };
fn trace(ro: vec3f, rd: vec3f, tmax: f32, steps: i32, pixA: f32) -> Hit {
  var h = Hit(-1., vec3f(0.), false);
  let ti = marchIce(ro, rd, 0., tmax, steps, pixA);
  var lim = tmax;
  if (ti > 0.) { h.t = ti; lim = ti; }
  let tc = traceChunks(ro, rd, lim);
  if (tc.x > 0.) { h.t = tc.x; h.n = tc.yzw; h.chunk = true; }
  return h;
}
fn shadeHit(ro: vec3f, rd: vec3f, h: Hit, pixA: f32, fine: bool) -> vec3f {
  gEmis = vec3f(0.);
  let p = ro + rd * h.t;
  var n = h.n; var lv = vec4f(1., 1., 0.5, 0.75);
  if (!h.chunk) { n = iceNormal(p, h.t, pixA, fine); lv = lightV(p + n * 2.0); }
  else {
    let bp = textureSampleLevel(noiseT, sR, p * 0.45, 0.).rgb;
    n = normalize(n + (bp - vec3f(0., 0., 0.5)) * 0.35);
  }
  return shadeIce(p, n, rd, h.t, pixA, lv, waveLow(p.xz) * select(0., 1., abs(p.y) < 3.), h.chunk);
}
fn airFog(col: vec3f, rd: vec3f, t: f32) -> vec3f {
  let f = 1. - exp(-t * 0.0012);
  var d = rd; d.y = 0.0;
  return mix(col, skyBase(normalize(d)), f);
}

struct FO { @location(0) col: vec4f, @location(1) dep: vec4f };
@fragment fn fs(@builtin(position) fc: vec4f) -> FO {
  let px = fc.xy + u.jit.xy;
  let ndc = (px * u.res.zw * 2. - 1.) * vec2f(1., -1.);
  let ro = u.cam.xyz + lensOff(ndc);
  var rd = rayD(ndc);
  let pixA = 2. * u.up.w * u.res.w;
  let dith = ign(fc.xy, u.fwd.w);
  let FAR = 1e6;

  // which side of the surface is this part of the lens on?
  let hc = waveS(ro.xz, 0.).x;
  let sN = (ro.y - hc) / u.jit.z + 0.008 * sin(ndc.x * 23. + u.cam.w * 0.7) + 0.003 * sin(ndc.x * 61. - u.cam.w * 1.1);
  let under = sN < 0.;
  let men = exp(-sN * sN / (0.015 * 0.015));
  rd = normalize(rd + u.up.xyz * (sign(sN) * men * 0.08));

  var col = vec3f(0.);
  var depthT = FAR;
  let tW = hitWater(ro, rd, 60000., pixA);
  let h = trace(ro, rd, select(60000., tW, tW > 0.), 96, pixA);

  if (!under) {
    if (h.t > 0.) {
      depthT = h.t;
      col = airFog(shadeHit(ro, rd, h, pixA, true), rd, h.t);
    } else if (tW > 0.) {
      depthT = tW;
      let p = ro + rd * tW;
      let fp = fpAt(tW, rd.y, pixA);
      let w = waveS(p.xz, fp * 0.6);
      var n = normalize(vec3f(-w.y, 1., -w.z));
      let cosi = sat(dot(n, -rd));
      let F = 0.035 + 0.965 * pow(1. - cosi, 3.4);
      // reflection
      var R = reflect(rd, n);
      if (R.y < 0.015) { R.y = 0.015; R = normalize(R); }
      let pr = p + vec3f(0., 0.03, 0.);
      let hr = trace(pr, R, 700., 56, pixA * 2.);
      var refl: vec3f;
      let rsig = pixA * (1. + fp * 0.6) * 1.3;
      if (hr.t > 0.) { refl = airFog(shadeHit(pr, R, hr, pixA * 2., false), R, hr.t); }
      else { refl = skyFull(R, rsig); }
      // refraction into the water
      var refr = vec3f(0.);
      let T = refract(rd, n, 0.75);
      if (F < 0.97) {
        let pt = p - vec3f(0., 0.03, 0.);
        let ht = trace(pt, T, 70., 28, pixA * 2.);
        let m = waterMedium(pt, T, select(400., ht.t, ht.t > 0.), 0.5, false);
        refr = m.s;
        if (ht.t > 0.) { refr += shadeHit(pt, T, ht, pixA * 2., false) * m.tr * vec3f(0.12, 0.24, 0.26) * (1. - smoothstep(20., 60., ht.t)); }
      }
      col = mix(refr, refl, F);
      // foam and lapping along the ice edge
      let q = (p - VMIN) / (VMAX - VMIN);
      if (all(q > vec3f(0.01)) && all(q < vec3f(0.99))) {
        let di = min(sdTex(vec3f(p.x, 0.4, p.z)), sdTex(vec3f(p.x, 2.2, p.z)) - 0.5) / FS;
        let nz = textureSampleLevel(noiseT, sR, vec3f(p.xz * 0.19, u.cam.w * 0.05), 0.);
        let lap = 0.5 + 0.5 * sin(u.cam.w * 0.9 + nz.a * 5.);
        let edge = di + nz.r * 1.3 - lap * 0.5;
        let foam = (1. - smoothstep(0.1, 1.0, edge)) * smoothstep(-0.5, 0.2, nz.g + 0.5 * (1. - sat(edge)));
        let lvf = lightV(p + vec3f(0., 1., 0.));
        let fcol = vec3f(0.78, 0.92, 1.0) * (MOONC * 0.7 * lvf.r + SKYAMB * 1.5 * (0.35 + 0.65 * lvf.g));
        col = mix(col, fcol, sat(foam) * 0.6);
      }
      col = airFog(col, rd, tW);
    } else {
      col = skyFull(rd, pixA * 0.85);
    }
  } else {
    var tHit = FAR; var emis = vec3f(0.);
    if (h.t > 0.) {
      tHit = h.t; depthT = h.t;
      col = shadeHit(ro, rd, h, pixA, true);
      emis = gEmis * exp(-0.009 * h.t);
    } else if (tW > 0.) {
      tHit = tW; depthT = tW;
      let p = ro + rd * tW;
      let fp = fpAt(tW, rd.y, pixA);
      let w = waveS(p.xz, max(fp * 0.5, 0.10));
      let nS = normalize(vec3f(-w.y, 1., -w.z));
      let n = normalize(vec3f(-w.y * 0.45, 1., -w.z * 0.45));
      let nd = -n;
      let T = refract(rd, nd, 1.333);
      var F = 1.;
      if (dot(T, T) > 0.) { F = 0.02 + 0.98 * pow(1. - sat(dot(T, n)), 5.); }
      // total internal reflection side: the deep water mirrored
      var R = reflect(rd, -nS);
      if (R.y > -0.01) { R.y = -0.01; R = normalize(R); }
      let pb = p - vec3f(0., 0.03, 0.);
      let hb = trace(pb, R, 160., 28, pixA * 2.);
      let mb = waterMedium(pb, R, select(400., hb.t, hb.t > 0.), 0.5, false);
      var refl = mb.s;
      if (hb.t > 0.) { refl += shadeHit(pb, R, hb, pixA * 2., false) * mb.tr; }
      var above = vec3f(0.);
      if (F < 0.995) {
        let pa = p + vec3f(0., 0.03, 0.);
        let ha = trace(pa, T, 700., 48, pixA * 2.);
        if (ha.t > 0.) { above = airFog(shadeHit(pa, T, ha, pixA * 2., false), T, ha.t); }
        else { var Tu = T; Tu.y = max(Tu.y, 0.); gSkyFx = 0.; above = skyBase(Tu) * 1.8 + vec3f(0.014, 0.026, 0.05); gSkyFx = 1.; }
      }
      col = mix(above, refl, F);
      // skylight focused by the ripples: the lit, wavy ceiling
      let spark = sat(0.5 - w.w * 0.9);
      let lw2 = waterL();
      let tilt = sat(0.5 + 5. * dot(nS.xz, lw2.xz));
      col += vec3f(0.07, 0.14, 0.25) * (0.14 + 0.45 * spark * spark + 1.0 * tilt * tilt * tilt) * exp(-tW * 0.010);
    }
    let m = waterMedium(ro, rd, tHit, dith, true);
    col = col * m.tr + m.s + emis;
  }
  // meniscus: dark refracting band with a thin bright lip
  let lip = exp(-(sN - 0.013) * (sN - 0.013) / (0.004 * 0.004));
  let mcore = exp(-sN * sN / (0.006 * 0.006));
  col = col * (1. - 0.55 * men - 0.35 * mcore) + vec3f(0.10, 0.17, 0.27) * lip * 0.6 + vec3f(0.01, 0.03, 0.05) * men;

  return FO(vec4f(max(col, vec3f(0.)), select(0., 1., under)), vec4f(depthT, 0., 0., 0.));
}
