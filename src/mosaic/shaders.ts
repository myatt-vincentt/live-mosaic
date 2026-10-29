// GLSL for the mosaic. Every pass is a full-screen quad drawn straight to
// clip space.
//
// Spaces:
//   P  the screen in screen heights: (u × aspect, v), y up.
//   q  the tile plane: P magnified a little around the face, so the tiles
//      there come out smaller (warpFwd / warpInv).
//
// The layout (re-made a few times a second): the picture is shrunk and
// smoothed (anaFrag), its edges found (gradFrag, edgeFrag), and the distance
// to the nearest edge spread over the screen (jfaFrag, distFrag). The rows
// of tiles are the bands of that distance — one tile high, at whole numbers
// of tiles from the nearest edge — so they follow every contour, like the
// rows of hand-laid tesserae. Inside a row the tiles are cut by "seeds":
// points on a fine grid in q, each pulled onto the middle of its row and
// turned to run along it (seedFrag), thinned so neighbours in a row keep a
// tile's length apart (misFrag) and spaced evenly (relaxFrag). A seed that
// would only move a hair stays where it is (settleFrag); the others glide to
// their new places over a moment (blendFrag), and the distance field eases
// over too, so a new layout never flickers. The broken-tile style skips the
// rows: its shards are plain cells around jittered points.
//
// Every frame each tile takes its colour from the live picture under it and
// is matched to the nearest stone of the style (colourFrag); the screen pass
// (mosaicFrag) cuts the tiles, grout, bevel and finish.

const COMMON = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  vec3 fromSrgb(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 toSrgb(vec3 c) {
    c = max(c, 0.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  vec3 oklab(vec3 c) {
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
    l = pow(max(l, 0.0), 1.0 / 3.0);
    m = pow(max(m, 0.0), 1.0 / 3.0);
    s = pow(max(s, 0.0), 1.0 / 3.0);
    return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
  }
  // The face magnifier: centre (xy), reach (z), magnification at the centre (w).
  float warpGain(vec2 P, vec4 w) {
    vec2 d = P - w.xy;
    return 1.0 + (w.w - 1.0) * exp(-dot(d, d) / (w.z * w.z));
  }
  vec2 warpFwd(vec2 P, vec4 w) {
    return w.xy + (P - w.xy) * warpGain(P, w);
  }
  vec2 warpInv(vec2 q, vec4 w) {
    vec2 d = q - w.xy;
    float rq = length(d);
    if (rq < 1e-6 || abs(w.w - 1.0) < 1e-4) return q;
    float r = rq / w.w;
    for (int i = 0; i < 5; i++) {
      float x = r * r / (w.z * w.z);
      float e = exp(-x);
      float f = r * (1.0 + (w.w - 1.0) * e) - rq;
      float df = 1.0 + (w.w - 1.0) * e * (1.0 - 2.0 * x);
      r = max(r - f / df, 0.0);
    }
    return w.xy + d * (r / rq);
  }
`;

/** Full-screen quad, straight to clip space. */
export const flatVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }
`;

/** The picture, shrunk, smoothed and in OKLab, eased against the last one. */
export const anaFrag = /* glsl */ `
  ${COMMON}
  uniform sampler2D uCam;
  uniform float uCamLinear;
  uniform sampler2D uPrev;
  uniform float uFresh;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 cam(vec2 uv) {
    vec3 c = texture2D(uCam, clamp(uv, 0.0, 1.0)).rgb;
    return uCamLinear > 0.5 ? c : fromSrgb(c);
  }
  void main() {
    vec2 o = uTexel * 0.9;
    vec3 c = cam(vUv) * 0.2
      + (cam(vUv + vec2(o.x, o.y)) + cam(vUv + vec2(-o.x, o.y))
       + cam(vUv + vec2(o.x, -o.y)) + cam(vUv - o)) * 0.2;
    vec3 lab = oklab(c);
    vec3 prev = texture2D(uPrev, vUv).xyz;
    gl_FragColor = vec4(uFresh > 0.5 ? lab : mix(prev, lab, 0.55), 1.0);
  }
`;

/**
 * Edge strength and direction: the smoothed structure tensor of the picture
 * (lightness plus some colour). Out: strength, cos and sin of the direction
 * across the edge.
 */
export const gradFrag = /* glsl */ `
  uniform sampler2D uAna;
  uniform vec2 uTexel;
  uniform float uChroma;
  varying vec2 vUv;
  vec3 at(vec2 o) {
    return texture2D(uAna, vUv + o * uTexel).xyz * vec3(1.0, uChroma, uChroma);
  }
  void main() {
    vec3 J = vec3(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 o = vec2(float(i), float(j));
        vec3 gx = (at(o + vec2(1.0, 0.0)) - at(o - vec2(1.0, 0.0))) * 0.5;
        vec3 gy = (at(o + vec2(0.0, 1.0)) - at(o - vec2(0.0, 1.0))) * 0.5;
        float w = (i == 0 && j == 0) ? 0.25 : ((i == 0 || j == 0) ? 0.125 : 0.0625);
        J += w * vec3(dot(gx, gx), dot(gx, gy), dot(gy, gy));
      }
    }
    float d = J.x - J.z;
    float l1 = 0.5 * (J.x + J.z + sqrt(d * d + 4.0 * J.y * J.y));
    float phi = 0.5 * atan(2.0 * J.y, d);
    gl_FragColor = vec4(sqrt(max(l1, 0.0)), cos(phi), sin(phi), 1.0);
  }
`;

/**
 * Thin edges (strong, and the strongest across the edge). An edge pixel
 * starts the distance spread: its own position and its direction.
 */
export const edgeFrag = /* glsl */ `
  uniform sampler2D uGrad;
  uniform vec2 uTexel;
  uniform float uThr;
  varying vec2 vUv;
  void main() {
    vec4 g = texture2D(uGrad, vUv);
    vec2 d = g.yz;
    float a = texture2D(uGrad, vUv + d * uTexel).x;
    float b = texture2D(uGrad, vUv - d * uTexel).x;
    // Along the edge it must carry on both ways: no specks, no lone dots.
    vec2 t = vec2(-d.y, d.x) * 1.5;
    float c1 = texture2D(uGrad, vUv + t * uTexel).x;
    float c2 = texture2D(uGrad, vUv - t * uTexel).x;
    bool edge = g.x > uThr && g.x >= a && g.x >= b && min(c1, c2) > 0.6 * uThr;
    gl_FragColor = edge ? vec4(gl_FragCoord.xy, d) : vec4(-1.0, -1.0, 0.0, 0.0);
  }
`;

/** One jump-flood step: each pixel keeps the nearest edge pixel it has heard of. */
export const jfaFrag = /* glsl */ `
  uniform sampler2D uPrev;
  uniform float uStep;
  uniform vec2 uSize;
  void main() {
    vec2 p = gl_FragCoord.xy;
    vec4 best = vec4(-1.0, -1.0, 0.0, 0.0);
    float bd = 1e20;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 q = p + vec2(float(i), float(j)) * uStep;
        if (q.x < 0.0 || q.y < 0.0 || q.x >= uSize.x || q.y >= uSize.y) continue;
        vec4 s = texelFetch(uPrev, ivec2(q), 0);
        if (s.x < 0.0) continue;
        vec2 d = s.xy - p;
        float dd = dot(d, d);
        if (dd < bd) { bd = dd; best = s; }
      }
    }
    gl_FragColor = best;
  }
`;

/** Distance to the nearest edge (screen heights), eased against the last one. No edges: rows run level. */
export const distFrag = /* glsl */ `
  uniform sampler2D uJfa;
  uniform sampler2D uPrev;
  uniform float uFresh;
  uniform vec2 uSize;
  /** The steadied person: the field follows quickly around you, slowly elsewhere. */
  uniform sampler2D uPerson;
  uniform vec2 uRate;
  varying vec2 vUv;
  float at(vec2 o) {
    vec2 p = clamp(gl_FragCoord.xy + o, vec2(0.5), uSize - 0.5);
    vec4 e = texelFetch(uJfa, ivec2(p), 0);
    return e.x < 0.0 ? p.y / uSize.y : length(p - e.xy) / uSize.y;
  }
  void main() {
    // Softened a little, so the rows round off instead of following every
    // step of a pixel edge.
    float D = at(vec2(0.0)) * 0.2;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.785398;
      D += at(vec2(cos(a), sin(a)) * 1.5) * 0.1;
    }
    float prev = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0).r;
    float near = texture2D(uPerson, vUv).r;
    for (int k = 0; k < 6; k++) {
      float a = float(k) * 1.0472;
      near = max(near, texture2D(uPerson, vUv + vec2(cos(a), sin(a)) * vec2(0.08 * uSize.y / uSize.x, 0.08)).r);
    }
    float rate = mix(uRate.y, uRate.x, near);
    gl_FragColor = vec4(uFresh > 0.5 ? D : mix(prev, D, rate), 0.0, 0.0, 1.0);
  }
`;

/** a → b by k, texel for texel. */
export const mixFrag = /* glsl */ `
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uK;
  void main() {
    ivec2 id = ivec2(gl_FragCoord.xy);
    gl_FragColor = mix(texelFetch(uA, id, 0), texelFetch(uB, id, 0), uK);
  }
`;

/**
 * Where each seed wants to be. Out per grid cell: its shift inside the cell
 * (cells), its turn (radians, −π/2..π/2) and its row: row number + 0.25
 * (undecided), + 0.75 (kept), or −1 (not used).
 */
export const seedFrag = /* glsl */ `
  ${COMMON}
  uniform sampler2D uDist;
  uniform vec2 uAnaSize;
  uniform vec4 uGrid;
  uniform vec4 uWarp;
  uniform float uAspect;
  /** Shift, turn, rows (1) or shards (0). */
  uniform vec3 uShape;
  float dist(vec2 uv) { return texture2D(uDist, uv).r; }
  void main() {
    vec2 id = floor(gl_FragCoord.xy);
    float g = uGrid.z;
    float s = uGrid.w;
    vec2 cc = uGrid.xy + (id + 0.5) * g;
    vec2 q = cc + (hash22(id + 17.0) - 0.5) * 2.0 * uShape.x * g;
    float turn = (hash12(id + 3.1) - 0.5) * 2.0 * uShape.y;
    float ang = turn;
    float row = 0.75;
    if (uShape.z > 0.5) {
      vec2 P = warpInv(q, uWarp);
      float sp = s / warpGain(P, uWarp);
      vec2 uv = clamp(P / vec2(uAspect, 1.0), vec2(0.0), vec2(1.0));
      vec2 tx = vec2(1.0 / uAnaSize.x, 0.0);
      vec2 ty = vec2(0.0, 1.0 / uAnaSize.y);
      float D = dist(uv);
      vec2 grad = vec2(dist(uv + tx) - dist(uv - tx), dist(uv + ty) - dist(uv - ty));
      vec2 n = length(grad) > 1e-6 ? normalize(grad) : vec2(0.0, 1.0);
      float k = floor(D / sp);
      // Onto the middle of its row, turned to run along it.
      P -= n * (D - (k + 0.5) * sp);
      q = warpFwd(P, uWarp);
      ang = atan(n.x, -n.y) + turn;
      row = k + 0.25;
    }
    ang -= 3.14159265 * floor((ang + 1.5707963) / 3.14159265);
    gl_FragColor = vec4(clamp((q - cc) / g, -0.7, 0.7), ang, row);
  }
`;

/**
 * Thinning, a few rounds: a seed that comes first (by a fixed random order,
 * where the tiles kept last time come before the rest, so the layout holds)
 * among its undecided neighbours in the row closer than `uSep` is kept; a
 * seed with a kept neighbour that close goes.
 */
export const misFrag = /* glsl */ `
  ${COMMON}
  uniform sampler2D uSeeds;
  uniform sampler2D uOld;
  uniform float uHasOld;
  uniform vec4 uGrid;
  uniform vec2 uGridSize;
  uniform float uSep;
  uniform float uLast;
  float order(ivec2 id, float k) {
    float o = hash12(vec2(id) + 0.37);
    if (uHasOld > 0.5) {
      vec4 was = texelFetch(uOld, id, 0);
      if (was.w >= 0.0 && fract(was.w) > 0.5 && floor(was.w) == k) o -= 1.0;
    }
    return o;
  }
  void main() {
    ivec2 id = ivec2(gl_FragCoord.xy);
    vec4 me = texelFetch(uSeeds, id, 0);
    if (me.w < 0.0 || fract(me.w) > 0.5) { gl_FragColor = me; return; }
    float k = floor(me.w);
    float g = uGrid.z;
    vec2 qi = (vec2(id) + 0.5 + me.xy) * g;
    vec2 t = vec2(cos(me.z), sin(me.z));
    vec2 n = vec2(-t.y, t.x);
    float mine = order(id, k);
    bool first = true;
    bool near = false;
    for (int j = -2; j <= 2; j++) {
      for (int i = -2; i <= 2; i++) {
        if (i == 0 && j == 0) continue;
        ivec2 jd = id + ivec2(i, j);
        if (jd.x < 0 || jd.y < 0 || float(jd.x) >= uGridSize.x || float(jd.y) >= uGridSize.y) continue;
        vec4 o = texelFetch(uSeeds, jd, 0);
        if (o.w < 0.0 || floor(o.w) != k) continue;
        vec2 d = (vec2(jd) + 0.5 + o.xy) * g - qi;
        if (abs(dot(d, n)) > 0.5 * uGrid.w || abs(dot(d, t)) > uSep) continue;
        if (fract(o.w) > 0.5) near = true;
        else if (order(jd, k) < mine) first = false;
      }
    }
    if (near) me.w = -1.0;
    else if (first || uLast > 0.5) me.w = k + 0.75;
    gl_FragColor = me;
  }
`;

/** Each kept seed moves halfway toward the middle of its two row neighbours. */
export const relaxFrag = /* glsl */ `
  uniform sampler2D uSeeds;
  uniform vec4 uGrid;
  uniform vec2 uGridSize;
  uniform float uOn;
  void main() {
    ivec2 id = ivec2(gl_FragCoord.xy);
    vec4 me = texelFetch(uSeeds, id, 0);
    if (uOn < 0.5 || me.w < 0.0) { gl_FragColor = me; return; }
    float k = floor(me.w);
    float g = uGrid.z;
    vec2 qi = (vec2(id) + 0.5 + me.xy) * g;
    vec2 t = vec2(cos(me.z), sin(me.z));
    vec2 n = vec2(-t.y, t.x);
    float left = -1e9;
    float right = 1e9;
    for (int j = -2; j <= 2; j++) {
      for (int i = -2; i <= 2; i++) {
        if (i == 0 && j == 0) continue;
        ivec2 jd = id + ivec2(i, j);
        if (jd.x < 0 || jd.y < 0 || float(jd.x) >= uGridSize.x || float(jd.y) >= uGridSize.y) continue;
        vec4 o = texelFetch(uSeeds, jd, 0);
        if (o.w < 0.0 || floor(o.w) != k) continue;
        vec2 d = (vec2(jd) + 0.5 + o.xy) * g - qi;
        if (abs(dot(d, n)) > 0.5 * uGrid.w) continue;
        float a = dot(d, t);
        if (a < 0.0) left = max(left, a);
        else right = min(right, a);
      }
    }
    vec2 off = me.xy;
    if (left > -1e8 && right < 1e8) off += t * (0.5 * (left + right)) * 0.5 / g;
    gl_FragColor = vec4(clamp(off, -0.7, 0.7), me.zw);
  }
`;

/** A seed that would only move a hair (and stays in its row) keeps its place. */
export const settleFrag = /* glsl */ `
  uniform sampler2D uNew;
  uniform sampler2D uOld;
  uniform float uHasOld;
  uniform vec2 uKeep;
  void main() {
    ivec2 id = ivec2(gl_FragCoord.xy);
    vec4 a = texelFetch(uNew, id, 0);
    if (uHasOld > 0.5) {
      vec4 b = texelFetch(uOld, id, 0);
      float da = abs(a.z - b.z);
      da = min(da, 3.14159265 - da);
      bool sameRow = (a.w < 0.0 && b.w < 0.0) || floor(a.w) == floor(b.w);
      if (sameRow && length(a.xy - b.xy) < uKeep.x && da < uKeep.y) a = b;
    }
    gl_FragColor = a;
  }
`;

/**
 * The seeds now: on their way from the last layout to the new one. Each
 * seed's row is read again where it is now, in the field as it is now, so
 * tiles change rows one by one as they glide, never all at once.
 */
export const blendFrag = /* glsl */ `
  ${COMMON}
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uK;
  uniform float uRows;
  uniform sampler2D uDistA;
  uniform sampler2D uDistB;
  uniform float uFieldK;
  uniform vec4 uGrid;
  uniform vec4 uWarp;
  uniform float uAspect;
  void main() {
    ivec2 id = ivec2(gl_FragCoord.xy);
    vec4 a = texelFetch(uA, id, 0);
    vec4 b = texelFetch(uB, id, 0);
    vec2 v = mix(vec2(cos(2.0 * a.z), sin(2.0 * a.z)), vec2(cos(2.0 * b.z), sin(2.0 * b.z)), uK);
    float ang = length(v) > 1e-4 ? 0.5 * atan(v.y, v.x) : b.z;
    vec2 off = mix(a.xy, b.xy, uK);
    // Each seed takes its new place in the rows at its own moment of the glide.
    float w = uK < 0.1 + 0.8 * hash12(vec2(id) + 0.71) ? a.w : b.w;
    if (uRows > 0.5 && w >= 0.0) {
      vec2 P = warpInv(uGrid.xy + (vec2(id) + 0.5 + off) * uGrid.z, uWarp);
      vec2 uv = clamp(P / vec2(uAspect, 1.0), 0.0, 1.0);
      float D = mix(texture2D(uDistA, uv).r, texture2D(uDistB, uv).r, uFieldK);
      w = floor(D * warpGain(P, uWarp) / uGrid.w) + fract(w);
    }
    gl_FragColor = vec4(off, ang, w);
  }
`;

/**
 * Each tile's stone: the live picture under the tile (averaged over it),
 * graded, and matched to the nearest stone of the style. A tile only swaps
 * stone when another fits clearly better, so camera noise doesn't make it
 * flicker. Out: the stone's linear colour and its number (÷ 16).
 */
export const colourFrag = /* glsl */ `
  ${COMMON}
  uniform sampler2D uSeeds;
  uniform sampler2D uCam;
  uniform float uCamLinear;
  uniform sampler2D uPrevCol;
  uniform float uFresh;
  uniform vec4 uGrid;
  uniform vec4 uWarp;
  uniform float uAspect;
  uniform vec3 uPalLab[16];
  uniform vec3 uPalRgb[16];
  uniform int uPalN;
  uniform int uGoldN;
  uniform float uGoldFrom;
  /** Contrast, saturation, colour weight, dither. */
  uniform vec4 uGrade;
  /** Lightness shift before matching. */
  uniform float uLift;
  /** The person's trail (see histFrag) and the steadied person now, and how much the trail shows. */
  uniform sampler2D uHist;
  uniform sampler2D uPerson;
  uniform float uTrail;
  vec3 cam(vec2 P) {
    vec3 c = texture2D(uCam, clamp(P / vec2(uAspect, 1.0), 0.0, 1.0)).rgb;
    return uCamLinear > 0.5 ? c : fromSrgb(c);
  }
  float far(vec3 lab, int i) {
    vec3 d = lab - uPalLab[i];
    d.yz *= uGrade.z;
    return dot(d, d);
  }
  void main() {
    ivec2 id = ivec2(gl_FragCoord.xy);
    vec4 sd = texelFetch(uSeeds, id, 0);
    vec2 q = uGrid.xy + (vec2(id) + 0.5 + sd.xy) * uGrid.z;
    vec2 P = warpInv(q, uWarp);
    float sp = uGrid.w / warpGain(P, uWarp);
    vec2 t = vec2(cos(sd.z), sin(sd.z)) * sp * 0.28;
    vec2 n = vec2(-t.y, t.x);
    vec3 c = cam(P) * 0.2
      + (cam(P + t) + cam(P - t) + cam(P + n) + cam(P - n)) * 0.14
      + (cam(P + t + n) + cam(P - t - n) + cam(P + t - n) + cam(P - t + n)) * 0.06;
    // Where you just were, the tile still takes your old colour, fading
    // back to what is behind you.
    if (uTrail > 0.0) {
      vec2 uv = clamp(P / vec2(uAspect, 1.0), 0.0, 1.0);
      vec4 hist = texture2D(uHist, uv);
      float you = texture2D(uPerson, uv).r;
      c = mix(c, hist.rgb, clamp(hist.a * (1.0 - you) * uTrail, 0.0, 1.0));
    }
    vec3 lab = oklab(c);
    float srcL = lab.x;
    lab.x = clamp((lab.x - 0.55) * uGrade.x + 0.55 + uLift, 0.0, 1.0);
    lab.yz *= uGrade.y;
    vec2 h = hash22(vec2(id) + 41.0) - 0.5;
    lab.x += h.x * uGrade.w;
    lab.yz += h.y * uGrade.w * 0.3;
    int plain = uPalN - uGoldN;
    bool gold = uGoldN > 0 && srcL > uGoldFrom;
    int lo = gold ? plain : 0;
    int hi = gold ? uPalN : plain;
    int best = lo;
    float bd = 1e9;
    for (int i = 0; i < 16; i++) {
      if (i < lo || i >= hi) continue;
      float dd = far(lab, i);
      if (dd < bd) { bd = dd; best = i; }
    }
    if (uFresh < 0.5) {
      int prev = int(texelFetch(uPrevCol, id, 0).a * 16.0 + 0.5);
      if (prev >= lo && prev < hi && prev != best && far(lab, prev) < bd + 0.0025) best = prev;
    }
    gl_FragColor = vec4(uPalRgb[best], float(best) / 16.0);
  }
`;

/**
 * You, steadied: the portrait mask trusted only where a person really is
 * (the tracked face and the body below it, each tracked hand and forearm),
 * softened, with hysteresis, and eased over a few frames so its outline
 * never flickers and no bits of the room show up as islands.
 */
export const personFrag = /* glsl */ `
  uniform sampler2D uRaw;
  uniform float uHasRaw;
  uniform vec2 uRawTexel;
  uniform sampler2D uPrev;
  uniform float uFresh;
  uniform float uBlend;
  uniform float uAspect;
  /** The face: centre x, y (uv, y up), width, height (uv); width 0 = none. */
  uniform vec4 uFace;
  uniform vec4 uCap[MAX_CAPSULES];
  uniform float uCapR[MAX_CAPSULES];
  uniform int uCapCount;
  varying vec2 vUv;
  float capsule(vec2 p, vec4 s, float r) {
    vec2 pa = p - s.xy, ba = s.zw - s.xy;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    return length(pa - ba * h) / max(r, 1e-4);
  }
  void main() {
    vec2 p = vUv * vec2(uAspect, 1.0);
    float gate = 0.0;
    float sure = 0.0;
    if (uFace.z > 0.0) {
      vec2 c = uFace.xy * vec2(uAspect, 1.0);
      float w = uFace.z * uAspect;
      float h = uFace.w;
      vec2 hd = (p - (c + vec2(0.0, 0.12 * h))) / vec2(w, 1.05 * h);
      gate = 1.0 - smoothstep(0.85, 1.15, length(hd));
      float chin = c.y - 0.45 * h;
      float down = clamp((chin - p.y) / (1.6 * h), 0.0, 1.0);
      float hw = w * (0.75 + 2.6 * down);
      gate = max(gate, (1.0 - smoothstep(hw * 0.9, hw * 1.2, abs(p.x - c.x)))
        * (1.0 - smoothstep(chin - 0.1 * h, chin + 0.25 * h, p.y)));
    }
    for (int i = 0; i < MAX_CAPSULES; i++) {
      if (i >= uCapCount) break;
      float d = capsule(p, uCap[i], uCapR[i]);
      gate = max(gate, 1.0 - smoothstep(0.95, 1.2, d));
      sure = max(sure, 1.0 - smoothstep(0.55, 0.8, d));
    }
    float m = 0.0;
    if (uHasRaw > 0.5) {
      m = texture2D(uRaw, vUv).g * 0.4;
      for (int k = 0; k < 6; k++) {
        float a = float(k) * 1.0472;
        m += texture2D(uRaw, vUv + vec2(cos(a), sin(a)) * uRawTexel * 2.0).g * 0.1;
      }
    }
    float target = max(m * gate, sure);
    float prev = texture2D(uPrev, vUv).r;
    float thr = prev > 0.5 ? 0.32 : 0.6;
    float bin = smoothstep(thr - 0.18, thr + 0.18, target);
    float v = mix(prev, bin, uFresh > 0.5 ? 1.0 : uBlend);
    gl_FragColor = vec4(v, v, v, 1.0);
  }
`;

/**
 * Your trail: a short memory of the person's picture. Where you are now it
 * holds you; where you were, your old picture stays, drifting a little after
 * you with a gentle sway, and fades.
 */
export const histFrag = /* glsl */ `
  uniform sampler2D uCam;
  uniform float uCamLinear;
  uniform sampler2D uPerson;
  uniform sampler2D uPrev;
  uniform float uFresh;
  /** How far the old picture drifts this frame (uv), and how much of it is left. */
  uniform vec2 uDrift;
  uniform float uKeep;
  varying vec2 vUv;
  vec3 fromSrgb(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  void main() {
    float you = texture2D(uPerson, vUv).r;
    vec3 c = texture2D(uCam, vUv).rgb;
    if (uCamLinear < 0.5) c = fromSrgb(c);
    vec4 old = uFresh > 0.5 ? vec4(0.0) : texture2D(uPrev, vUv - uDrift);
    old.a *= uKeep;
    gl_FragColor = vec4(mix(old.rgb, c, you), max(you, old.a));
  }
`;

/**
 * The mosaic on screen. Layer 0 is the current style; while a change
 * ripples across, layer 1 (the new style) pops in tile by tile over it.
 */
export const mosaicFrag = /* glsl */ `
  ${COMMON}
  uniform float uAspect;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uLight;
  uniform sampler2D uCam;
  uniform float uCamLinear;
  /** The distance field: the last one, the new one, and how far between. */
  uniform sampler2D uDistA;
  uniform sampler2D uDistB;
  uniform float uFieldK;
  uniform vec2 uAnaSize;

  uniform sampler2D uSeeds0;
  uniform sampler2D uCol0;
  uniform vec4 uGrid0;
  uniform vec2 uGridSize0;
  uniform vec4 uWarp0;
  uniform int uStyle0;

  uniform sampler2D uSeeds1;
  uniform sampler2D uCol1;
  uniform vec4 uGrid1;
  uniform vec2 uGridSize1;
  uniform vec4 uWarp1;
  uniform int uStyle1;

  /** 1 while a change ripples; seconds since it started; where from (x, y, mode). */
  uniform float uChange;
  uniform float uChangeT;
  uniform vec3 uOrigin;
  /** Seconds to cross the screen; the farthest distance from a point origin. */
  uniform vec2 uRipple;

  /** Per style: aspect, shards, size jitter, wobble. */
  uniform vec4 uShapeA[4];
  /** Per style: grout, bevel, tilt, see-through glass. */
  uniform vec4 uShapeB[4];
  /** Per style: grain, gloss, shine, sparkle. */
  uniform vec4 uFinish[4];
  uniform vec3 uGroutCol[4];
  /** Per style: number of the first gold stone (16 = none). */
  uniform float uGoldIdx[4];
  uniform float uDebug;
  varying vec2 vUv;

  struct Tile {
    vec2 id;
    float e;       // distance to the tile's edge (screen heights)
    vec2 c;        // its seed (tile plane)
    vec2 local;    // this pixel in the tile's own frame (screen heights)
    vec2 outward;  // toward the nearest edge, on screen
    float s;       // tile size (screen heights)
    float px;      // one pixel (screen heights)
  };

  float field(vec2 uv) {
    return mix(texture2D(uDistA, uv).r, texture2D(uDistB, uv).r, uFieldK);
  }

  /**
   * Where rows meet head-on or close into a ring (the middle of a small
   * shape) they can't run on; like a mosaicist, fill those gaps with small
   * irregular pieces: the cell around the nearest seed, any row.
   */
  Tile fillTile(sampler2D seeds, vec4 grid, vec2 gsize, vec4 warp, vec2 P, vec2 q) {
    Tile T;
    float g = grid.z;
    float gain = warpGain(P, warp);
    vec2 cell = floor((q - grid.xy) / g);
    float f1 = 1e9, f2 = 1e9;
    vec2 c2 = q;
    T.id = vec2(0.0);
    T.c = q;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = cell + vec2(float(i), float(j));
        if (id.x < 0.0 || id.y < 0.0 || id.x >= gsize.x || id.y >= gsize.y) continue;
        vec4 sd = texelFetch(seeds, ivec2(id), 0);
        vec2 c = grid.xy + (id + 0.5 + sd.xy) * g;
        float f = length(q - c);
        if (f < f1) { f2 = f1; c2 = T.c; f1 = f; T.id = id; T.c = c; }
        else if (f < f2) { f2 = f; c2 = c; }
      }
    }
    T.local = (q - T.c) / gain;
    T.e = 0.5 * (f2 - f1) / gain;
    T.s = grid.w / gain;
    T.px = 1.0 / uRes.y;
    vec2 o = c2 - T.c;
    T.outward = length(o) > 0.0 ? normalize(o) : vec2(0.0);
    return T;
  }

  /** A tile in rows: the row from the distance field, the cut from the seeds. */
  Tile rowTile(sampler2D seeds, vec4 grid, vec2 gsize, vec4 warp, int st, vec2 P, float D, vec3 grad) {
    Tile T;
    vec4 sa = uShapeA[st];
    float g = grid.z;
    float s = grid.w;
    float gain = warpGain(P, warp);
    float sp = s / gain;
    vec2 q = warpFwd(P, warp);
    // Hand-cut edges: a little wobble along and across the rows.
    vec2 w = q / s * 2.1;
    q += (vec2(vnoise(w), vnoise(w + 19.7)) - 0.5) * 2.0 * sa.w * s;
    if (grad.z < 0.55) return fillTile(seeds, grid, gsize, warp, P, q);
    float r = D / sp + (vnoise(w + 7.3) - 0.5) * 2.0 * sa.w;
    float k = floor(r);
    vec2 rowDir = vec2(-grad.y, grad.x);
    vec2 cell = floor((q - grid.xy) / g);
    float f1 = 1e9, f2 = 1e9, fa = 1e9;
    float lx1 = 0.0, ang1 = 0.0;
    vec2 id1 = vec2(-1.0), c1 = q, ida = vec2(-1.0), ca = q;
    float anga = 0.0, lxa = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = cell + vec2(float(i), float(j));
        if (id.x < 0.0 || id.y < 0.0 || id.x >= gsize.x || id.y >= gsize.y) continue;
        vec4 sd = texelFetch(seeds, ivec2(id), 0);
        if (sd.w < 0.0) continue;
        vec2 c = grid.xy + (id + 0.5 + sd.xy) * g;
        vec2 d = q - c;
        // Cut across the row as it runs here, each cut a little askew.
        float skew = (hash12(id + 3.1) - 0.5) * 2.0 * sa.z;
        vec2 t = rowDir + vec2(-rowDir.y, rowDir.x) * skew;
        float lx = dot(d, t);
        if (floor(sd.w) == k) {
          float sz = 1.0 + (hash12(id + 5.3) - 0.5) * 2.0 * sa.z;
          float f = abs(lx) / sz;
          if (f < f1) { f2 = f1; f1 = f; id1 = id; c1 = c; lx1 = lx; ang1 = sd.z; }
          else if (f < f2) f2 = f;
        } else {
          float f = length(d);
          if (f < fa) { fa = f; ida = id; ca = c; anga = sd.z; lxa = lx; }
        }
      }
    }
    bool found = id1.x >= 0.0;
    if (!found) {
      // A gap in the row: look a little further along it.
      for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
          if (abs(i) < 2 && abs(j) < 2) continue;
          vec2 id = cell + vec2(float(i), float(j));
          if (id.x < 0.0 || id.y < 0.0 || id.x >= gsize.x || id.y >= gsize.y) continue;
          vec4 sd = texelFetch(seeds, ivec2(id), 0);
          if (sd.w < 0.0 || floor(sd.w) != k) continue;
          vec2 c = grid.xy + (id + 0.5 + sd.xy) * g;
          float lx = dot(q - c, rowDir);
          float f = abs(lx);
          if (f < f1) { f2 = f1; f1 = f; id1 = id; c1 = c; lx1 = lx; ang1 = sd.z; }
          else if (f < f2) f2 = f;
        }
      }
      found = id1.x >= 0.0;
    }
    if (!found) { id1 = ida; c1 = ca; ang1 = anga; lx1 = lxa; }
    float fr = fract(r);
    float rowE = min(fr, 1.0 - fr) * sp;
    float cutE = found ? 0.5 * (f2 - f1) / gain : 1e9;
    T.id = id1;
    T.c = c1;
    T.s = sp;
    T.px = 1.0 / uRes.y;
    T.e = min(rowE, cutE);
    T.outward = rowE < cutE ? (fr < 0.5 ? -grad.xy : grad.xy) : rowDir * sign(lx1);
    T.local = vec2(lx1 / gain, (fr - 0.5) * sp);
    return T;
  }

  /** A broken shard: the cell around the nearest jittered point. */
  Tile shardTile(sampler2D seeds, vec4 grid, vec2 gsize, vec4 warp, int st, vec2 P) {
    Tile T;
    vec4 sa = uShapeA[st];
    float g = grid.z;
    float gain = warpGain(P, warp);
    vec2 q = warpFwd(P, warp);
    vec2 w = q / g * 2.3;
    q += (vec2(vnoise(w), vnoise(w + 19.7)) - 0.5) * 2.0 * sa.w * g;
    vec2 cell = floor((q - grid.xy) / g);
    float f1 = 1e9, f2 = 1e9;
    vec2 c2 = q;
    T.id = vec2(0.0);
    T.c = q;
    float ang1 = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = cell + vec2(float(i), float(j));
        if (id.x < 0.0 || id.y < 0.0 || id.x >= gsize.x || id.y >= gsize.y) continue;
        vec4 sd = texelFetch(seeds, ivec2(id), 0);
        vec2 c = grid.xy + (id + 0.5 + sd.xy) * g;
        float sz = 1.0 + (hash12(id + 5.3) - 0.5) * 2.0 * sa.z;
        float f = length(q - c) / sz;
        if (f < f1) { f2 = f1; c2 = T.c; f1 = f; T.id = id; T.c = c; ang1 = sd.z; }
        else if (f < f2) { f2 = f; c2 = c; }
      }
    }
    vec2 d = q - T.c;
    float cs = cos(ang1), sn = sin(ang1);
    T.local = vec2(d.x * cs + d.y * sn, -d.x * sn + d.y * cs) / gain;
    T.e = 0.5 * (f2 - f1) / gain;
    T.s = g / gain;
    T.px = 1.0 / uRes.y;
    vec2 o = c2 - T.c;
    T.outward = length(o) > 0.0 ? normalize(o) : vec2(0.0);
    return T;
  }

  Tile findTile(sampler2D seeds, vec4 grid, vec2 gsize, vec4 warp, int st, vec2 P, float D, vec3 grad) {
    if (uShapeA[st].y > 0.5) return shardTile(seeds, grid, gsize, warp, st, P);
    return rowTile(seeds, grid, gsize, warp, st, P, D, grad);
  }

  vec3 camAt(vec2 P) {
    vec3 c = texture2D(uCam, clamp(P / vec2(uAspect, 1.0), 0.0, 1.0)).rgb;
    return uCamLinear > 0.5 ? c : fromSrgb(c);
  }

  /** One tile (or the grout around it), lit. lift: extra brightness (popping in). */
  vec3 shade(Tile T, int st, vec4 stone, vec2 P, float lift) {
    vec4 sb = uShapeB[st];
    vec4 fin = uFinish[st];
    float s = T.s;
    float gh = max(0.5 * sb.x * s, 0.6 * T.px);
    float cover = smoothstep(gh - 0.75 * T.px, gh + 0.75 * T.px, T.e);
    float h = smoothstep(gh, gh + sb.y * s, T.e);

    // Grout: a little uneven, darker where it meets the tiles.
    vec3 grout = uGroutCol[st] * (0.92 + 0.12 * vnoise(P * uRes.y * 0.35));
    grout *= mix(0.72, 1.0, clamp((gh - T.e) / gh, 0.0, 1.0));

    vec3 col = stone.rgb;
    float idx = stone.a * 16.0;
    bool gold = idx > uGoldIdx[st] - 0.5;
    // Each stone a touch different, with a grain of its own.
    col *= 1.0 + (hash12(T.id + 9.1) - 0.5) * 0.14;
    vec2 g = T.local / s;
    float grain = vnoise(g * 7.0 + T.id * 3.7) * 0.6 + vnoise(g * 19.0 + T.id) * 0.4 - 0.5;
    col *= 1.0 + fin.x * 0.22 * grain;
    float speck = step(0.965, hash12(floor(g * 11.0) + T.id * 13.0));
    col *= 1.0 - fin.x * 0.18 * speck;

    // The tile's surface: flat, bevelled down at its edges, set at a tiny tilt.
    vec2 tilt = (hash22(T.id + 2.7) - 0.5) * 2.0 * sb.z;
    vec3 N = normalize(vec3(T.outward * (1.0 - h) * 1.1 + tilt, 1.0));
    vec3 L = normalize(uLight);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float ndl = dot(N, L);
    float ndh = max(dot(N, H), 0.0);
    col *= 0.62 + 0.45 * ndl;

    // Glass: lit from inside, with a little of the live picture through it.
    if (sb.w > 0.0) {
      float inner = 1.0 - clamp(length(T.local) / (0.6 * s), 0.0, 1.0);
      col *= 1.0 + sb.w * 0.45 * inner * h;
      col = mix(col, col * (0.55 + 1.1 * dot(camAt(P), vec3(0.3, 0.55, 0.15))), sb.w * 0.5);
    }
    vec3 spec = vec3(pow(ndh, fin.z) * fin.y);
    if (gold) {
      float glint = pow(ndh, 10.0);
      col = stone.rgb * (0.35 + 1.5 * glint) + stone.rgb * pow(ndh, 60.0) * 1.6;
      col *= 1.0 + 0.25 * grain;
      spec *= 0.4;
    }
    // Sparkle: tiny glints in the glass that come and go as the light moves.
    if (fin.w > 0.0) {
      vec2 cellp = floor(g * 9.0 + T.id * 5.0);
      float spot = step(0.93, hash12(cellp));
      float tw = pow(max(dot(normalize(vec3((hash22(cellp) - 0.5) * 1.4, 1.0)), H), 0.0), 40.0);
      spec += vec3(1.0, 0.95, 0.85) * spot * tw * fin.w * 1.8;
    }
    col = col * (1.0 + lift) + spec;
    return mix(grout, col, cover);
  }

  void main() {
    vec2 P = vec2(vUv.x * uAspect, vUv.y);
    float D = field(vUv);
    vec2 tx = vec2(1.0 / uAnaSize.x, 0.0);
    vec2 ty = vec2(0.0, 1.0 / uAnaSize.y);
    // The rows' direction across (xy), and how clearly the rows run here
    // (z: about 1 in a row, toward 0 where rows meet).
    vec2 gr = vec2(field(vUv + tx) - field(vUv - tx), field(vUv + ty) - field(vUv - ty));
    float gm = length(gr) * uAnaSize.y * 0.5;
    vec3 grad = vec3(gm > 1e-4 ? gr / length(gr) : vec2(0.0, 1.0), gm);

    Tile T0 = findTile(uSeeds0, uGrid0, uGridSize0, uWarp0, uStyle0, P, D, grad);
    vec4 stone0 = texelFetch(uCol0, ivec2(T0.id), 0);
    if (uDebug > 1.5) {
      // The rows: bands one tile high at whole tiles from the nearest edge.
      float sp = uGrid0.w / warpGain(P, uWarp0);
      float band = mod(floor(D / sp), 2.0);
      vec3 c = mix(vec3(0.15, 0.2, 0.35), vec3(0.35, 0.45, 0.7), band);
      if (D * uAnaSize.y < 0.75) c = vec3(1.0);
      gl_FragColor = vec4(c, 1.0);
      return;
    }
    if (uDebug > 0.5) {
      vec3 r = vec3(hash12(T0.id), hash12(T0.id + 1.3), hash12(T0.id + 2.9));
      gl_FragColor = vec4(mix(vec3(0.05), r, step(0.5 * uShapeB[uStyle0].x * T0.s, T0.e)), 1.0);
      return;
    }
    vec3 col = shade(T0, uStyle0, stone0, P, 0.0);

    if (uChange > 0.5) {
      Tile T1 = findTile(uSeeds1, uGrid1, uGridSize1, uWarp1, uStyle1, P, D, grad);
      // When this tile's turn comes: by its distance from where the change
      // started, plus a little randomness, so it ripples tile by tile.
      float from;
      if (uOrigin.z < 0.5) from = length(T1.c - uOrigin.xy) / uRipple.y;
      else if (uOrigin.z < 1.5) from = T1.c.x / uAspect;
      else from = 1.0 - T1.c.x / uAspect;
      float delay = clamp(from, 0.0, 1.0) * uRipple.x + (hash12(T1.id + 7.7) - 0.5) * 0.06;
      float p = clamp((uChangeT - delay) / 0.25, 0.0, 1.0);
      if (p > 0.0) {
        float ease = 1.0 - pow(1.0 - p, 3.0);
        vec4 stone1 = texelFetch(uCol1, ivec2(T1.id), 0);
        if (p >= 1.0) {
          col = shade(T1, uStyle1, stone1, P, 0.0);
        } else {
          // Pops up from its centre: a smaller tile growing to full size,
          // a little bright as it lands, with a soft shadow around it.
          float gh1 = 0.5 * uShapeB[uStyle1].x * T1.s;
          float inset = (1.0 - ease) * 0.5 * T1.s;
          float edge = T1.e - inset;
          float cov = smoothstep(-T1.px, T1.px, edge);
          float shadow = (1.0 - smoothstep(0.0, 0.3 * T1.s, -edge)) * (1.0 - ease) * 0.4;
          col *= 1.0 - shadow;
          Tile Tn = T1;
          Tn.e = edge + gh1 * (1.0 - ease);
          col = mix(col, shade(Tn, uStyle1, stone1, P, 0.3 * (1.0 - ease)), cov);
        }
      }
    }
    gl_FragColor = vec4(toSrgb(col), 1.0);
  }
`;

/** The finished mosaic onto the screen. */
export const blitFrag = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0); }
`;
