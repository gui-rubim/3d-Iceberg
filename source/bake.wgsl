// ---- startup bakes: tiling noise volume, iceberg distance volume, light volume ----
// slice index arrives through instance_index (firstInstance)
struct BO { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) slice: u32 };
@vertex fn vsBake(@builtin(vertex_index) i: u32, @builtin(instance_index) inst: u32) -> BO {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return BO(vec4f(p * 2. - 1., 0., 1.), inst);
}

// ---------- tiling noise (64^3) ----------
fn gnoiseP(p: vec3f, per: i32, seed: i32) -> f32 {
  let i = floor(p); let f = p - i; let ii = vec3i(i);
  let w = f * f * f * (f * (f * 6. - 15.) + 10.);
  var r = array<f32, 8>();
  for (var k = 0; k < 8; k++) {
    let o = vec3i(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    let c = ((ii + o) % per + per) % per;
    r[k] = dot(h3(c + vec3i(seed * 131, seed * 57, seed * 17)) * 2. - 1., f - vec3f(o));
  }
  let x0 = mix(r[0], r[1], w.x); let x1 = mix(r[2], r[3], w.x);
  let x2 = mix(r[4], r[5], w.x); let x3 = mix(r[6], r[7], w.x);
  return mix(mix(x0, x1, w.y), mix(x2, x3, w.y), w.z);
}
fn worleyP(p: vec3f, per: i32) -> f32 {
  let i = floor(p); let f = p - i; let ii = vec3i(i);
  var d = 9.;
  for (var z = -1; z <= 1; z++) { for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec3i(x, y, z);
    let c = ((ii + o) % per + per) % per;
    let q = vec3f(o) + h3(c + vec3i(91, 7, 33)) - f;
    d = min(d, dot(q, q));
  } } }
  return sqrt(d);
}
@fragment fn fsNoise(i: BO) -> @location(0) vec4f {
  let p = vec3f(i.pos.xy, f32(i.slice) + 0.5) / 64.;
  let a = gnoiseP(p * 4., 4, 1) + 0.5 * gnoiseP(p * 8., 8, 2) + 0.25 * gnoiseP(p * 16., 16, 3);
  let b = gnoiseP(p * 4., 4, 5) + 0.5 * gnoiseP(p * 8., 8, 6) + 0.25 * gnoiseP(p * 16., 16, 7);
  let c = worleyP(p * 6., 6);
  let d = gnoiseP(p * 3., 3, 9) + 0.5 * gnoiseP(p * 6., 6, 10);
  return vec4f(a, b, c, d);
}

// ---------- iceberg field ----------
fn smin(a: f32, b: f32, k: f32) -> f32 { let h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * 0.25; }
fn sdCone(p: vec3f, a: vec3f, b: vec3f, r1: f32, r2: f32) -> f32 {
  let ba = b - a; let l2 = dot(ba, ba); let rr = r1 - r2; let a2 = l2 - rr * rr; let il2 = 1. / l2;
  let pa = p - a; let y = dot(pa, ba); let z = y - l2;
  let xv = pa * l2 - ba * y; let x2 = dot(xv, xv); let y2 = y * y * l2; let z2 = z * z * l2;
  let k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) { return sqrt(x2 + z2) * il2 - r2; }
  if (sign(y) * a2 * y2 < k) { return sqrt(x2 + y2) * il2 - r1; }
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
fn sdBox(p: vec3f, c: vec3f, b: vec3f, r: f32) -> f32 {
  let q = abs(p - c) - b + r;
  return length(max(q, vec3f(0.))) + min(max(q.x, max(q.y, q.z)), 0.) - r;
}
fn sdEll(p: vec3f, c: vec3f, r: vec3f) -> f32 {
  let q = (p - c) / r; let k0 = length(q); let k1 = length(q / r);
  return k0 * (k0 - 1.) / max(k1, 1e-5);
}
fn iceField(p0: vec3f) -> f32 {
  // low-frequency domain warp
  let wp = p0 * 0.012;
  let warp = vec3f(gnoise(wp + 7.), gnoise(wp + 19.3), gnoise(wp + 31.7));
  let up = smoothstep(-12., 6., p0.y);          // 1 above water
  let p = p0 + warp * mix(20., 6., up);

  // ---- emerged part: spires, shoulders, shelves ----
  var a = sdCone(p, vec3f(6., -14., -2.), vec3f(14., 87., -6.), 36., 3.6);
  a = smin(a, sdCone(p, vec3f(-14., -14., 4.), vec3f(-25., 74., 0.), 30., 2.0), 7.);
  a = smin(a, sdCone(p, vec3f(-4., 20., 0.), vec3f(-6., 50., -2.), 22., 12.), 8.);
  a = smin(a, sdCone(p, vec3f(32., -14., -12.), vec3f(42., 46., -16.), 25., 2.4), 7.);
  a = smin(a, sdBox(p, vec3f(-46., 9., 8.), vec3f(18., 22., 22.), 6.), 6.);
  a = smin(a, sdBox(p, vec3f(-30., 22., -16.), vec3f(13., 26., 12.), 5.), 6.);
  a = smin(a, sdBox(p, vec3f(30., -6., 24.), vec3f(27., 9.5, 15.), 5.), 6.);
  a = smin(a, sdCone(p, vec3f(56., -10., 8.), vec3f(72., 17., 5.), 17., 1.8), 6.);
  a = smin(a, sdCone(p, vec3f(-60., -8., 26.), vec3f(-67., 20., 30.), 13., 1.8), 5.);
  // fluted melt channels, crags and sharp creases
  let fl = gnoise(p * vec3f(0.060, 0.014, 0.060) + 3.) * 4.2 + gnoise(p * vec3f(0.13, 0.035, 0.13) + 9.) * 1.7;
  let cr = gnoise(p * 0.085 + 21.) * 2.2;
  let crease = (abs(gnoise(p * vec3f(0.045, 0.018, 0.045) + 50.)) - 0.16) * 6.5;
  // faceting: cellular cones give sharp creases between flat-ish faces
  let fc = (0.55 - worleyP(p * vec3f(0.085, 0.06, 0.085) + 4.7, 1 << 20)) * 5.0 + (0.55 - worleyP(p * 0.19 + 9.1, 1 << 20)) * 1.5;
  a += (fl + cr + crease + fc) * smoothstep(-1.5, 6., a + 9.);
  // calving faces: sheer planar cuts
  a = -smin(-a, -dot(p - vec3f(-61., 0., 10.), normalize(vec3f(-0.95, 0.12, 0.3))), 2.5);
  a = -smin(-a, -dot(p - vec3f(40., 0., -30.), normalize(vec3f(0.55, 0.25, -0.8))), 3.);
  a = -smin(-a, -dot(p - vec3f(0., 0., 36.), normalize(vec3f(0.12, 0.3, 0.95))), 1.5);
  a = -smin(-a, -dot(p - vec3f(66., 0., 0.), normalize(vec3f(0.9, 0.36, 0.22))), 1.5);
  // stray bergy bit

  // ---- submerged mass ----
  var b = sdEll(p, vec3f(0., -27., 0.), vec3f(92., 21., 84.));
  b = smin(b, sdEll(p, vec3f(4., -66., -2.), vec3f(98., 58., 88.)), 18.);
  b = smin(b, sdEll(p, vec3f(-24., -128., 10.), vec3f(78., 70., 70.)), 24.);
  b = smin(b, sdEll(p, vec3f(40., -100., 30.), vec3f(58., 52., 52.)), 20.);
  b = smin(b, sdEll(p, vec3f(22., -190., -8.), vec3f(52., 58., 48.)), 24.);
  b = smin(b, sdEll(p, vec3f(-12., -232., 6.), vec3f(27., 30., 25.)), 16.);
  let sub = smoothstep(-2., -30., p0.y);
  // draped, fluted relief with ledges
  let dr = gnoise(p * vec3f(0.024, 0.0065, 0.024) + 5.) * 15. + gnoise(p * vec3f(0.05, 0.017, 0.05) + 13.) * 6.
         + gnoise(p * 0.10 + 17.) * 2.2;
  b += dr * mix(0.15, 1., sub);
  // sharp-crested cups and vertical flutes so the keel reads as carved ice, not a pillow
  b += ((0.55 - worleyP(p * vec3f(0.05, 0.03, 0.05) + 2.2, 1 << 20)) * 9. + (abs(gnoise(p * vec3f(0.035, 0.008, 0.035) + 70.)) - 0.2) * 9.) * sub;

  var d = smin(a, b, 10.);
  // wave-cut notch at the waterline
  d += 1.7 * exp(-(p0.y - 0.2) * (p0.y - 0.2) / 1.8);
  // fissures that will carry the amber veins
  d += 2.4 * veinMask(p0, 0.055);
  return d * FS;
}
@fragment fn fsSdf(i: BO) -> @location(0) vec4f {
  let dims = vec3f(256., 320., 256.);
  let p = VMIN + (VMAX - VMIN) * vec3f(i.pos.xy, f32(i.slice) + 0.5) / dims;
  return vec4f(iceField(p), 0., 0., 1.);
}

// ---------- light volume ----------
@group(1) @binding(0) var sdfT: texture_3d<f32>;
@group(1) @binding(1) var sC: sampler;
fn sdf(p: vec3f) -> f32 {
  let q = clamp(p, VMIN + 1.2, VMAX - 1.2);
  let d = textureSampleLevel(sdfT, sC, (q - VMIN) / (VMAX - VMIN), 0.).r;
  return d + length(p - q);
}
fn sdfN(p: vec3f) -> vec3f {
  let e = vec2f(1.2, 0.);
  return normalize(vec3f(sdf(p + e.xyy) - sdf(p - e.xyy), sdf(p + e.yxy) - sdf(p - e.yxy), sdf(p + e.yyx) - sdf(p - e.yyx)) + 1e-6);
}
fn softVis(ro: vec3f, rd: vec3f, tmax: f32, k: f32, steps: i32) -> f32 {
  var res = 1.; var t = 0.8;
  for (var i = 0; i < steps; i++) {
    let d = sdf(ro + rd * t);
    res = min(res, k * d / t);
    if (res < 0.003 || t > tmax) { break; }
    t += clamp(d, 0.7, 14.);
  }
  return sat(res);
}
@fragment fn fsLight(i: BO) -> @location(0) vec4f {
  let dims = vec3f(128., 160., 128.);
  var p = VMIN + (VMAX - VMIN) * vec3f(i.pos.xy, f32(i.slice) + 0.5) / dims;
  let d0 = sdf(p);
  let n = sdfN(p);
  // inside voxels take the values of the nearest surface point
  if (d0 < 1.0) { p += n * (1.0 - d0) / FS; }
  // moon: soft shadow; under water the light arrives refracted
  var l = LDIR;
  if (p.y < 0.) { l = -refract(-LDIR, vec3f(0., 1., 0.), 0.75); }
  let moon = softVis(p, l, 260., 7., 56);
  // sky dome visibility
  var sky = 0.;
  for (var k = 0; k < 24; k++) {
    let fk = (f32(k) + 0.5) / 24.;
    let ph = f32(k) * 2.399963;
    let y = 0.08 + 0.92 * fk; let r = sqrt(1. - y * y);
    sky += softVis(p, vec3f(cos(ph) * r, y, sin(ph) * r), 90., 3.5, 14);
  }
  sky /= 24.;
  // optical thickness of ice towards the moon, from just inside the surface
  let pin = p - n * 2.2;
  var th = 0.;
  for (var k = 0; k < 28; k++) {
    let s = (f32(k) + 0.5) * 1.6;
    th += step(sdf(pin + l * s), 0.) * 1.6;
  }
  let trans = exp(-th / 9.);
  // local thinness: is there another surface close behind?
  let thin = sat(1. + sdf(p - n * 7.) / (7. * FS));
  return vec4f(moon, sky, trans, thin);
}
