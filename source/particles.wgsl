// ---- marine snow and bubbles: camera-wrapped instanced sprites, drawn after TAA ----
@group(1) @binding(0) var depT: texture_2d<f32>;
@group(1) @binding(1) var hisT: texture_2d<f32>;
@group(1) @binding(2) var lightT: texture_3d<f32>;
@group(1) @binding(3) var sC: sampler;
const NSNOW = 26000u;
const NBUB = 240u;
struct PO { @builtin(position) pos: vec4f, @location(0) q: vec3f, @location(1) col: vec4f };
fn proj(v: vec3f, c: vec3f, r: vec4f, up: vec4f, f: vec3f) -> vec3f {
  let d = v - c; let w = dot(d, f);
  return vec3f(dot(d, r.xyz) / (r.w * w), dot(d, up.xyz) / (up.w * w), w);
}
@vertex fn vsPart(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PO {
  var o: PO;
  o.pos = vec4f(2., 2., 2., 1.); o.q = vec3f(0.); o.col = vec4f(0.);
  let corner = vec2f(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2. - 1.;
  let h = h3(vec3i(i32(ii), 5, 9)); let g = h3(vec3i(i32(ii), 11, 3));
  let t = u.cam.w;
  var wp: vec3f; var rad: f32; var kind = 0.; var fade = 1.;
  if (ii < NSNOW) {
    let B = vec3f(46., 46., 46.);
    let base = h * B + vec3f(sin(t * 0.21 + g.x * 40.), -t * (0.02 + 0.03 * g.y), cos(t * 0.17 + g.z * 40.)) * vec3f(0.25, 1., 0.25);
    let fr = fract((base - u.cam.xyz) / B) - 0.5;
    wp = u.cam.xyz + fr * B;
    fade = 1. - smoothstep(0.36, 0.49, max(abs(fr.x), max(abs(fr.y), abs(fr.z))));
    rad = 0.004 + 0.013 * g.x * g.x;
  } else if (ii < NSNOW + NBUB) {
    let B = vec3f(60., 70., 60.);
    let sp = 0.35 + 0.5 * g.y;
    let base = h * B + vec3f(sin(t * 1.7 + g.x * 30.) * 0.12, t * sp, cos(t * 1.3 + g.z * 30.) * 0.12);
    let fr = fract((base - u.cam.xyz) / B) - 0.5;
    wp = u.cam.xyz + fr * B;
    fade = 1. - smoothstep(0.36, 0.49, max(abs(fr.x), max(abs(fr.y), abs(fr.z))));
    rad = 0.012 + 0.03 * g.x; kind = 1.;
  } else {
    // burst released when the lens plunges through the surface
    let age = u.plunge.w - g.x * 0.5;
    if (age < 0. || age > 4.5) { return o; }
    let a = h.x * 6.283; let rr = 0.25 + 1.9 * sqrt(h.y);
    wp = u.plunge.xyz + vec3f(cos(a) * rr, -0.3 - 2.6 * h.z * (1. - exp(-age * 2.)) + age * age * (0.25 + 0.5 * g.y), sin(a) * rr)
       + vec3f(sin(age * 5. + g.z * 20.), 0., cos(age * 4. + g.y * 20.)) * 0.06;
    rad = 0.004 + 0.012 * g.z * g.z; kind = 1.;
    fade = sat(age * 6.) * sat((4.5 - age) * 0.5);
  }
  if (wp.y > -0.12) { return o; }
  let c = proj(wp, u.cam.xyz, u.right, u.up, u.fwd.xyz);
  if (c.z < 0.12) { return o; }
  let ip = vec2i((c.xy * vec2f(0.5, -0.5) + 0.5) * u.res.xy);
  if (ip.x >= 0 && ip.y >= 0 && ip.x < i32(u.res.x) && ip.y < i32(u.res.y)) {
    if (textureLoad(depT, ip, 0).x < c.z * 0.98) { return o; }
  }
  let pc = proj(wp, u.pcam.xyz, u.pright, u.pup, u.pfwd.xyz);
  let pixA = 2. * u.up.w * u.res.w;
  var rp = rad / (c.z * pixA);
  // out-of-focus growth close to the lens
  let coc = mix(3., 1., kind) * max(0., 1. - c.z / 4.) * (u.res.y / 1440.);
  rp = min(rp, 5. * u.res.y / 1440.);
  rp = min(rp, mix(1e3, 9. * u.res.y / 1440., kind));
  var alpha = 1.;
  let rmin = 1.3;
  let rq = max(rp + coc, rmin);
  alpha *= (rp * rp) / (rq * rq) * mix(1., 3.5, sat(coc * 0.5));
  rp = rq;
  let sc = c.xy * vec2f(0.5, -0.5) * u.res.xy;
  var sv = vec2f(0.);
  if (pc.z > 0.05) { sv = (sc - pc.xy * vec2f(0.5, -0.5) * u.res.xy) * 0.; }
  var sl = length(sv);
  let smax = min(40., 3. * rp + 5.);
  if (sl > smax) { sv *= smax / sl; sl = smax; }
  let dir = select(vec2f(1., 0.), sv / max(sl, 1e-4), sl > 1e-3);
  let perp = vec2f(-dir.y, dir.x);
  let hl = sl * 0.5;
  let off = dir * corner.x * (hl + rp * 2.2) + perp * corner.y * rp * 2.2;
  alpha *= rp / (rp + hl * 0.7);
  let depth = max(-wp.y, 0.);
  let lq = (wp - VMIN) / (VMAX - VMIN);
  var lv = vec2f(1.);
  if (all(lq > vec3f(0.)) && all(lq < vec3f(1.))) { lv = textureSampleLevel(lightT, sC, lq, 0.).rg; }
  var L = vec3f(0.115, 0.185, 0.36) * 0.55 * exp(-KD * depth) * (0.4 + 0.6 * lv.y) + MOONC * 0.85 * exp(-KD * depth * 1.3) * lv.x * 0.8;
  L += vec3f(0.0025, 0.004, 0.006);
  L = mix(vec3f(dot(L, vec3f(0.3, 0.5, 0.2))), L, 0.45) * exp(-SIGT * c.z) * mix(0.28, 1.0, kind);
  let near = smoothstep(1.0, 2.4, c.z) * smoothstep(-0.12, -0.6, wp.y);
  o.pos = vec4f((sc + off) / (u.res.xy * vec2f(0.5, -0.5)), 0.5, 1.);
  o.q = vec3f(corner.x * (hl + rp * 2.2), corner.y * rp * 2.2, hl);
  o.col = vec4f(L * alpha * fade * near, kind + rp * 0.001);
  o.col.a = kind * 100. + rp;
  return o;
}
@fragment fn fsPart(i: PO) -> @location(0) vec4f {
  let kind = floor(i.col.a / 100.); let rp = i.col.a - kind * 100.;
  let dx = max(abs(i.q.x) - i.q.z, 0.);
  let d = length(vec2f(dx, i.q.y)) / rp;
  var a = exp(-d * d * 2.2);
  if (kind > 0.5 && rp > 400.) {
    // bubble: bright rim, hollow centre, glint on top
    a = smoothstep(1.25, 0.95, d) * (0.4 + 0.6 * smoothstep(0.3, 0.95, d)) + 0.6 * exp(-dot(vec2f(dx, i.q.y + rp * 0.5), vec2f(dx, i.q.y + rp * 0.5)) / (rp * rp * 0.05));
  }
  let med = textureLoad(hisT, vec2i(i.pos.xy), 0).a;
  return vec4f(i.col.rgb * a * smoothstep(0.5, 0.95, med), 0.);
}
