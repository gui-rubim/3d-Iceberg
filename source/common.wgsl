// ---- shared by every module ----
struct U {
  cam: vec4f,    // xyz, time
  right: vec4f,  // xyz, tanHalfFovX
  up: vec4f,     // xyz, tanHalfFovY
  fwd: vec4f,    // xyz, frame index
  pcam: vec4f,   // previous frame camera
  pright: vec4f,
  pup: vec4f,
  pfwd: vec4f,
  res: vec4f,    // w, h, 1/w, 1/h
  jit: vec4f,    // jitter px xy, lens half height (m), dt
  st: vec4f,     // depth01, lens wetness, seconds since emerge, hud water mark (0..1)
  st2: vec4f,    // motion blur scale, camera mode, hud alpha, debug
  plunge: vec4f, // xyz of last plunge, seconds since plunge
};
@group(0) @binding(0) var<uniform> u: U;

const PI = 3.14159265;
const VMIN = vec3f(-144., -272., -144.);
const VMAX = vec3f(144., 100., 144.);
const LDIR = vec3f(-0.8605, 0.3602, 0.3602); // towards the moon
const MOONC = vec3f(0.60, 0.76, 1.0);
const KD = vec3f(0.017, 0.0095, 0.0068);   // downwelling attenuation per metre
const SIGT = vec3f(0.017, 0.0100, 0.0070);
const FS = 0.5;                           // stored field = distance * FS (keeps marching conservative) // view-ray extinction per metre

fn pcg3(v: vec3u) -> vec3u {
  var x = v * 1664525u + 1013904223u;
  x.x += x.y * x.z; x.y += x.z * x.x; x.z += x.x * x.y;
  x ^= x >> vec3u(16u);
  x.x += x.y * x.z; x.y += x.z * x.x; x.z += x.x * x.y;
  return x;
}
fn pcg1(v: u32) -> u32 { let s = v * 747796405u + 2891336453u; let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
fn h3(p: vec3i) -> vec3f { return vec3f(pcg3(vec3u(p))) * (1.0 / 4294967296.0); }
fn ign(p: vec2f, frame: f32) -> f32 {
  let q = p + 5.588238 * (frame % 64.0);
  return fract(52.9829189 * fract(0.06711056 * q.x + 0.00583715 * q.y));
}
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
// gradient noise, roughly [-0.8, 0.8]
fn gnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = p - i; let ii = vec3i(i);
  let w = f * f * f * (f * (f * 6. - 15.) + 10.);
  var r = array<f32, 8>();
  for (var k = 0; k < 8; k++) {
    let o = vec3i(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    r[k] = dot(h3(ii + o) * 2. - 1., f - vec3f(o));
  }
  let x0 = mix(r[0], r[1], w.x); let x1 = mix(r[2], r[3], w.x);
  let x2 = mix(r[4], r[5], w.x); let x3 = mix(r[6], r[7], w.x);
  return mix(mix(x0, x1, w.y), mix(x2, x3, w.y), w.z);
}
// amber fissure field: x = signed sheet function, y = presence mask
fn veinG(p: vec3f) -> vec2f {
  let q = p * vec3f(0.016, 0.019, 0.016) + vec3f(3.1, 7.7, 1.3);
  let wq = q + 0.55 * vec3f(gnoise(q * 1.6 + 11.), gnoise(q * 1.6 + 23.), gnoise(q * 1.6 + 37.));
  return vec2f(gnoise(wq), gnoise(p * 0.0085 + vec3f(40., 2., 9.)));
}
fn veinTaper(m: f32, y: f32) -> f32 { return smoothstep(-0.12 - 0.1 * smoothstep(-90., -200., y), 0.2, m) * smoothstep(-6., -22., y); }
fn veinMask(p: vec3f, width: f32) -> f32 {
  let v = veinG(p);
  let taper = veinTaper(v.y, p.y);
  return taper * (1. - smoothstep(width * 0.35 * taper, width * (0.4 + 0.6 * taper), abs(v.x)));
}
fn lensOff(ndc: vec2f) -> vec3f {
  return u.up.xyz * (ndc.y * u.jit.z) + u.right.xyz * (ndc.x * u.jit.z * u.res.x * u.res.w);
}
fn rayD(ndc: vec2f) -> vec3f {
  return normalize(u.fwd.xyz + u.right.xyz * (ndc.x * u.right.w) + u.up.xyz * (ndc.y * u.up.w));
}
// previous-frame uv of world point P (or direction when isDir)
fn reproj(P: vec3f, ndc: vec2f, isDir: bool) -> vec3f {
  var v = P;
  if (!isDir) { v = P - lensOff(ndc) - u.pcam.xyz; }
  let w = dot(v, u.pfwd.xyz);
  let x = dot(v, u.pright.xyz) / (u.pright.w * w);
  let y = dot(v, u.pup.xyz) / (u.pup.w * w);
  return vec3f(x * 0.5 + 0.5, 0.5 - y * 0.5, w);
}
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32, @builtin(instance_index) inst: u32) -> VO {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return VO(vec4f(p * 2. - 1., 0., 1.), vec2f(p.x, 1. - p.y));
}
