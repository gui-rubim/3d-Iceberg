// ---- ocean spectrum: three tiling cascades (h, dh/dx, dh/dz, laplacian) + mip chain ----
@group(1) @binding(0) var outT: texture_storage_2d_array<rgba16float, write>;
@group(1) @binding(1) var inT: texture_2d_array<f32>;
const WL = vec3f(192., 31., 5.3);
const WAMP = vec3f(0.120, 0.033, 0.0050);
@compute @workgroup_size(8, 8, 1) fn csWaves(@builtin(global_invocation_id) id: vec3u) {
  let c = i32(id.z);
  let L = WL[c];
  let x = (vec2f(id.xy) + 0.5) / 256. * L;
  let t = u.cam.w;
  var acc = vec4f(0.);
  let spread = mix(1.5, 3.0, f32(c) * 0.5);
  for (var i = 0; i < 26; i++) {
    let h = h3(vec3i(i, c, 77));
    let g = h3(vec3i(i, c, 177));
    let ang = 0.9 + (h.x - 0.5) * spread + (g.z - 0.5) * 0.6;
    let m = 2. + 9.5 * h.y * h.y;
    let ki = round(m * vec2f(cos(ang), sin(ang)));
    if (dot(ki, ki) < 1.) { continue; }
    let k = ki * (2. * PI / L);
    let kl = length(k);
    let A = WAMP[c] * pow(2. / length(ki), 1.25) * (0.45 + h.z) * 2.2;
    let ph = dot(k, x) - sqrt(9.81 * kl) * t + 2. * PI * g.x;
    let s = sin(ph); let co = cos(ph);
    acc += vec4f(A * s, A * k.x * co, A * k.y * co, -A * kl * kl * s);
  }
  textureStore(outT, id.xy, c, acc);
}
@compute @workgroup_size(8, 8, 1) fn csMip(@builtin(global_invocation_id) id: vec3u) {
  let c = i32(id.z); let p = vec2i(id.xy) * 2;
  let v = textureLoad(inT, p, c, 0) + textureLoad(inT, p + vec2i(1, 0), c, 0)
        + textureLoad(inT, p + vec2i(0, 1), c, 0) + textureLoad(inT, p + vec2i(1, 1), c, 0);
  textureStore(outT, id.xy, c, v * 0.25);
}
