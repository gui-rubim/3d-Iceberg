// ---- temporal AA, motion blur, bloom, exposure, final grade ----
@group(1) @binding(0) var tA: texture_2d<f32>;
@group(1) @binding(1) var tB: texture_2d<f32>;
@group(1) @binding(2) var tC: texture_2d<f32>;
@group(1) @binding(3) var tD: texture_2d<f32>;
@group(1) @binding(4) var sL: sampler;

fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn toYCC(c: vec3f) -> vec3f { return vec3f(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
fn fromYCC(c: vec3f) -> vec3f { return vec3f(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
fn prevUV(fc: vec2f, t: f32) -> vec3f {
  let ndc = (fc * u.res.zw * 2. - 1.) * vec2f(1., -1.);
  let rd = rayD(ndc);
  if (t > 9e5) { return reproj(rd, ndc, true); }
  return reproj(u.cam.xyz + lensOff(ndc) + rd * t, ndc, false);
}

// ---------- TAA: tA = current colour, tB = depth, tC = history ----------
fn histCR(uv: vec2f) -> vec4f {
  let sp = uv * u.res.xy; let tc = floor(sp - 0.5) + 0.5; let f = sp - tc;
  let w0 = f * (-0.5 + f * (1. - 0.5 * f)); let w1 = 1. + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2. - 1.5 * f)); let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2; let o12 = w2 / w12;
  let t0 = (tc - 1.) * u.res.zw; let t3 = (tc + 2.) * u.res.zw; let t12 = (tc + o12) * u.res.zw;
  var r = textureSampleLevel(tC, sL, vec2f(t12.x, t0.y), 0.) * (w12.x * w0.y)
        + textureSampleLevel(tC, sL, vec2f(t0.x, t12.y), 0.) * (w0.x * w12.y)
        + textureSampleLevel(tC, sL, vec2f(t12.x, t12.y), 0.) * (w12.x * w12.y)
        + textureSampleLevel(tC, sL, vec2f(t3.x, t12.y), 0.) * (w3.x * w12.y)
        + textureSampleLevel(tC, sL, vec2f(t12.x, t3.y), 0.) * (w12.x * w3.y);
  let ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / ws, vec4f(0.));
}
struct TO { @location(0) hist: vec4f, @location(1) work: vec4f };
@fragment fn fsTaa(@builtin(position) fc: vec4f) -> TO {
  let ip = vec2i(fc.xy);
  let mx = vec2i(u.res.xy) - 1;
  var m1 = vec3f(0.); var m2 = vec3f(0.);
  var tmin = 1e9; var cur = vec4f(0.);
  var cmin = vec3f(1e9); var cmax = vec3f(-1e9);
  // un-jittering blend of the centre neighbourhood (Blackman-Harris-ish)
  var acc = vec4f(0.); var wacc = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let q = clamp(ip + vec2i(x, y), vec2i(0), mx);
    let c = textureLoad(tA, q, 0);
    let d = textureLoad(tB, q, 0).x;
    tmin = min(tmin, d);
    let yc = toYCC(c.rgb / (1. + lum(c.rgb)));
    m1 += yc; m2 += yc * yc;
    cmin = min(cmin, yc); cmax = max(cmax, yc);
    let dd = vec2f(f32(x), f32(y)) - u.jit.xy;
    let w = exp(-2.29 * dot(dd, dd));
    acc += vec4f(c.rgb / (1. + lum(c.rgb)), c.a) * w; wacc += w;
    if (x == 0 && y == 0) { cur = c; }
  } }
  let curF = acc / wacc;
  let mean = m1 / 9.;
  let sd = sqrt(max(m2 / 9. - mean * mean, vec3f(0.)));
  let pv = prevUV(fc.xy, tmin);
  var outc = vec4f(curF.rgb / max(1. - lum(curF.rgb), 1e-3), curF.a);
  if (pv.z > 0. && all(pv.xy > vec2f(0.)) && all(pv.xy < vec2f(1.)) && u.st2.w < 0.5) {
    let hs = histCR(pv.xy);
    var hy = toYCC(hs.rgb / (1. + lum(hs.rgb)));
    // variance clip towards the neighbourhood mean
    let lo = max(mean - sd * 1.15, cmin); let hi = min(mean + sd * 1.15, cmax);
    let ctr = 0.5 * (lo + hi); let ext = 0.5 * (hi - lo) + 1e-5;
    let v = hy - ctr; let a = abs(v / ext); let ma = max(a.x, max(a.y, a.z));
    if (ma > 1.) { hy = ctr + v / ma; }
    let cy = toYCC(curF.rgb);
    let vel = length((pv.xy - fc.xy * u.res.zw) * u.res.xy);
    let alpha = mix(0.07, 0.16, sat(vel * 0.08));
    let ry = mix(hy, cy, alpha);
    let rgb = max(fromYCC(ry), vec3f(0.));
    outc = vec4f(rgb / max(1. - lum(rgb), 1e-3), mix(hs.a, curF.a, 0.25));
  }
  outc = min(outc, vec4f(64.));
  return TO(outc, outc);
}

// ---------- motion blur: tA = colour, tB = depth ----------
@fragment fn fsMB(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy * u.res.zw;
  let t = textureLoad(tB, vec2i(fc.xy), 0).x;
  let pv = prevUV(fc.xy, t);
  let c0 = textureSampleLevel(tA, sL, uv, 0.);
  if (pv.z <= 0.) { return c0; }
  var v = (uv - pv.xy) * u.st2.x * 0.7 * smoothstep(0.5, 6., t);
  let lp = length(v * u.res.xy);
  if (lp < 0.6) { return c0; }
  v *= min(1., 28. / lp);
  let j = ign(fc.xy, u.fwd.w) - 0.5;
  var acc = c0; var w = 1.;
  for (var i = 0; i < 8; i++) {
    let s = (f32(i) + 0.5 + j) / 8. - 0.5;
    acc += textureSampleLevel(tA, sL, uv + v * s, 0.); w += 1.;
  }
  return acc / w;
}

// ---------- bloom ----------
@fragment fn fsDown(i: VO) -> @location(0) vec4f {
  let ts = 1. / vec2f(textureDimensions(tA));
  let a = textureSampleLevel(tA, sL, i.uv + ts * vec2f(-1., -1.), 0.).rgb;
  let b = textureSampleLevel(tA, sL, i.uv + ts * vec2f(1., -1.), 0.).rgb;
  let c = textureSampleLevel(tA, sL, i.uv + ts * vec2f(-1., 1.), 0.).rgb;
  let d = textureSampleLevel(tA, sL, i.uv + ts * vec2f(1., 1.), 0.).rgb;
  let e = textureSampleLevel(tA, sL, i.uv, 0.).rgb;
  // Karis-weighted on every level keeps tiny bright stars from flickering
  let wa = 1. / (1. + lum(a)); let wb = 1. / (1. + lum(b)); let wc = 1. / (1. + lum(c)); let wd = 1. / (1. + lum(d)); let we = 4. / (1. + lum(e));
  return vec4f((a * wa + b * wb + c * wc + d * wd + e * we) / (wa + wb + wc + wd + we), 1.);
}
// tA = smaller level (already blurred), tB = this level
@fragment fn fsUp(i: VO) -> @location(0) vec4f {
  let ts = 1. / vec2f(textureDimensions(tA));
  var s = textureSampleLevel(tA, sL, i.uv, 0.).rgb * 4.;
  s += (textureSampleLevel(tA, sL, i.uv + ts * vec2f(1., 0.), 0.).rgb + textureSampleLevel(tA, sL, i.uv - ts * vec2f(1., 0.), 0.).rgb
      + textureSampleLevel(tA, sL, i.uv + ts * vec2f(0., 1.), 0.).rgb + textureSampleLevel(tA, sL, i.uv - ts * vec2f(0., 1.), 0.).rgb) * 2.;
  s += textureSampleLevel(tA, sL, i.uv + ts, 0.).rgb + textureSampleLevel(tA, sL, i.uv - ts, 0.).rgb
     + textureSampleLevel(tA, sL, i.uv + ts * vec2f(1., -1.), 0.).rgb + textureSampleLevel(tA, sL, i.uv + ts * vec2f(-1., 1.), 0.).rgb;
  return vec4f(mix(textureSampleLevel(tB, sL, i.uv, 0.).rgb, s / 16., 0.62), 1.);
}

// ---------- exposure: tA = small bloom level, tB = previous exposure ----------
@fragment fn fsExpo(i: VO) -> @location(0) vec4f {
  var s = 0.; var w = 0.;
  for (var y = 0; y < 6; y++) { for (var x = 0; x < 10; x++) {
    let uv = (vec2f(f32(x), f32(y)) + 0.5) / vec2f(10., 6.);
    let d = uv - 0.5;
    let wt = exp(-dot(d, d) * 3.);
    s += log(max(lum(textureSampleLevel(tA, sL, uv, 0.).rgb), 1e-5)) * wt; w += wt;
  } }
  let avg = exp(s / w);
  let tgt = clamp(0.105 / pow(avg, 0.62), 0.5, 4.6);
  let prev = textureLoad(tB, vec2i(0), 0).x;
  let dt = u.jit.w;
  let rate = select(4.5, 0.8, tgt > prev);
  var e = mix(tgt, prev, exp(-dt * rate));
  if (prev <= 0. || u.st2.w > 0.5) { e = tgt; }
  return vec4f(e, avg, 0., 1.);
}

// ---------- final: tA = scene, tB = bloom, tC = exposure, tD = TAA output (medium flag) ----------
fn aces(x: vec3f) -> vec3f {
  let a = x * (x + 0.0245786) - 0.000090537;
  let b = x * (0.983729 * x + 0.4329510) + 0.238081;
  return a / b;
}
fn tonemap(c: vec3f) -> vec3f {
  let m1 = mat3x3f(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  let m2 = mat3x3f(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return clamp(m2 * aces(m1 * c), vec3f(0.), vec3f(1.));
}
fn dropLayer(uv0: vec2f, scale: f32, seed: i32, wet: f32) -> vec3f {
  let asp = u.res.x * u.res.w;
  let uv = uv0 * vec2f(asp, 1.) * scale;
  let id = floor(uv);
  let h = h3(vec3i(i32(id.x), i32(id.y), seed));
  let g = h3(vec3i(i32(id.x), i32(id.y), seed + 9));
  if (h.z > 0.18) { return vec3f(0.); }
  // each bead dries out at its own moment and creeps down a little while draining
  let life = sat((wet - 0.08 - g.x * 0.7) * 5.);
  let f = fract(uv) - vec2f(0.3 + 0.4 * h.x, 0.3 + 0.4 * h.y - (1. - wet) * 0.18 * g.z);
  let r = (0.08 + 0.16 * g.y * g.y) * life;
  let d = length(f * vec2f(1., 0.86));
  let m = 1. - smoothstep(r * 0.6, r, d);
  return vec3f(-f * m * 0.55 / scale, m);
}
@fragment fn fsFinal(i: VO) -> @location(0) vec4f {
  var uv = i.uv;
  let med = textureSampleLevel(tD, sL, uv, 0.).a;
  let wet = u.st.y * (1. - smoothstep(0.02, 0.5, med));
  var dropM = 0.;
  if (wet > 0.003) {
    let d1 = dropLayer(uv, 13., 3, wet); let d2 = dropLayer(uv + 0.37, 27., 7, wet); let d3 = dropLayer(uv + 0.11, 46., 15, wet);
    let dd = d1 + d2 + d3;
    // draining sheet right after surfacing
    let film = smoothstep(0.72, 1., wet);
    let fl = vec2f(sin(uv.y * 38. + u.cam.w * 3.1 + sin(uv.x * 17.) * 2.), cos(uv.x * 29. - u.cam.w * 2.3)) * 0.0035 * film;
    uv += dd.xy;
    dropM = sat(dd.z);
  }
  let cc = uv - 0.5;
  let r2 = dot(cc, cc);
  let ca = cc * r2 * 0.002;
  let cen = textureSampleLevel(tA, sL, uv, 0.).rgb;
  var col = vec3f(textureSampleLevel(tA, sL, uv - ca, 0.).r, cen.g, textureSampleLevel(tA, sL, uv + ca, 0.).b);
  // restrained sharpening (limited so it cannot ring on stars or the silhouette)
  let o = u.res.zw * 0.75;
  let bl = (textureSampleLevel(tA, sL, uv + o, 0.).rgb + textureSampleLevel(tA, sL, uv - o, 0.).rgb
          + textureSampleLevel(tA, sL, uv + vec2f(o.x, -o.y), 0.).rgb + textureSampleLevel(tA, sL, uv + vec2f(-o.x, o.y), 0.).rgb) * 0.25;
  let lc = lum(cen);
  col += clamp((cen - bl) * 0.45, vec3f(-0.12 * lc), vec3f(0.12 * lc));
  col = max(col, vec3f(0.));
  let bloom = textureSampleLevel(tB, sL, uv, 0.).rgb;
  col = mix(col, bloom, 0.085 + 0.12 * dropM);
  let ex = textureLoad(tC, vec2i(0), 0).x;
  col *= ex;
  col *= 1. - 0.42 * smoothstep(0.12, 0.62, r2);
  col = tonemap(col * 1.25);
  col = pow(col, vec3f(1. / 2.2));
  // HUD: thin depth rail with a mark at the waterline
  let p = i.pos.xy; let H = u.res.y; let W = u.res.x;
  let x0 = W - round(H * 0.035); let y0 = H * 0.32; let y1 = H * 0.68;
  let px1 = max(1., H / 1080.);
  let onRail = (1. - smoothstep(0.5 * px1, 1.2 * px1, abs(p.x - x0))) * step(y0, p.y) * step(p.y, y1);
  let yw = mix(y0, y1, u.st.w);
  let tick = (1. - smoothstep(0.5 * px1, 1.2 * px1, abs(p.y - yw))) * step(abs(p.x - x0), 5. * px1);
  let yc = mix(y0, y1, u.st.x);
  let dot_ = 1. - smoothstep(3.2 * px1, 4.4 * px1, length(p - vec2f(x0, yc)));
  let hud = max(max(onRail * 0.4, tick * 0.65), dot_ * 0.95) * u.st2.z;
  col = mix(col, vec3f(0.86, 0.93, 1.), hud);
  // grain + dither
  let sd = u32(p.x) + u32(p.y) * 4099u + (u32(u.fwd.w) & 1023u) * 16777259u;
  col += (f32(pcg1(sd)) + f32(pcg1(sd ^ 0x9e3779b9u))) * (1. / 4294967296.) * (1. / 255.) - (1. / 255.);
  return vec4f(col, 1.);
}
