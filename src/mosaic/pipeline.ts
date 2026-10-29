// The mosaic's GPU work (see shaders.ts for what each pass does). One
// pipeline per canvas; a "layout" holds one style's tiles. Two layouts are
// in use while a change ripples across (the old style and the new one),
// otherwise one.
import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

import { FACE, LAYOUT, TILES } from "./config";
import {
  anaFrag,
  blendFrag,
  colourFrag,
  distFrag,
  edgeFrag,
  flatVert,
  gradFrag,
  histFrag,
  jfaFrag,
  misFrag,
  mixFrag,
  mosaicFrag,
  personFrag,
  relaxFrag,
  seedFrag,
  settleFrag,
} from "./shaders";
import { type Capsules, MAX_CAPSULES } from "./sim/gate";
import {
  hexToLinear,
  linearToOklab,
  MAX_PALETTE,
  STYLES,
  type MosaicStyle,
} from "./styles";

type Uniforms = Record<string, { value: unknown }>;
type Pair = [WebGLRenderTarget, WebGLRenderTarget];

const target = (linear: boolean, half = true) =>
  new WebGLRenderTarget(4, 4, {
    type: half ? HalfFloatType : UnsignedByteType,
    format: RGBAFormat,
    minFilter: linear ? LinearFilter : NearestFilter,
    magFilter: linear ? LinearFilter : NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });
const pair = (linear: boolean, half = true): Pair => [
  target(linear, half),
  target(linear, half),
];

const material = (
  fragmentShader: string,
  uniforms: Uniforms,
  defines?: Record<string, number>,
) =>
  new ShaderMaterial({
    uniforms,
    defines,
    vertexShader: flatVert,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

/** Layout glides run at an even pace, so one frame never carries most of a change. */
const glide = (t: number) => Math.min(1, Math.max(0, t));

/** One style's palette, ready for the shaders. */
const paletteOf = (style: MosaicStyle) => {
  const lab = Array.from({ length: MAX_PALETTE }, () => new Vector3());
  const rgb = Array.from({ length: MAX_PALETTE }, () => new Vector3());
  style.palette.forEach((hex, i) => {
    const lin = hexToLinear(hex);
    rgb[i].fromArray(lin);
    lab[i].fromArray(linearToOklab(lin));
  });
  return { lab, rgb, n: style.palette.length };
};
const PALETTES = STYLES.map(paletteOf);

/** Seed grid spacing against the tile size: finer than the tiles, then thinned. */
const SEED_GRID = 0.7;

export type Layout = {
  style: number;
  cols: number;
  rows: number;
  /** Tile size and seed grid spacing (tile-plane units), the grid's corner. */
  s: number;
  g: number;
  ox: number;
  oy: number;
  raw: Pair;
  target: Pair;
  ti: number;
  prev: WebGLRenderTarget;
  now: WebGLRenderTarget;
  col: Pair;
  ci: number;
  warpPrev: Vector4;
  warpTarget: Vector4;
  warp: Vector4;
  /** When its last layout was made (s), and whether it needs a clean start. */
  at: number;
  fresh: boolean;
  colFresh: boolean;
  /** When it was last drawn (s). */
  usedAt: number;
};

export class MosaicPipeline {
  readonly gl: WebGLRenderer;

  private readonly scene = new Scene();

  private readonly camera = new OrthographicCamera();

  private readonly quad: Mesh;

  private readonly ana = pair(true);

  private ai = 0;

  private anaFresh = true;

  private readonly grad = target(true);

  private readonly jfa = pair(false);

  /** The distance field: the eased target (ping-pong) and where it eases from. */
  private readonly dist = pair(true);

  private di = 0;

  private readonly distFrom = pair(true);

  private dfi = 0;

  /** When the field last changed (s). */
  private fieldAt = -1;

  readonly anaSize = new Vector2(4, 4);

  /** You, steadied (see personFrag), and your trail (see histFrag). */
  private readonly person = pair(true, false);

  private pi = 0;

  private personFresh = true;

  private readonly hist = pair(true);

  private hi = 0;

  readonly layouts: (Layout | null)[] = STYLES.map(() => null);

  readonly final = target(true, false);

  /** How much the trail shows (0 = none), set by the scene. */
  trail = 0;

  private readonly m = {
    ana: material(anaFrag, {
      uCam: { value: null },
      uCamLinear: { value: 0 },
      uPrev: { value: null },
      uFresh: { value: 1 },
      uTexel: { value: new Vector2() },
    }),
    grad: material(gradFrag, {
      uAna: { value: null },
      uTexel: { value: new Vector2() },
      uChroma: { value: LAYOUT.edgeChroma },
    }),
    edge: material(edgeFrag, {
      uGrad: { value: null },
      uTexel: { value: new Vector2() },
      uThr: { value: LAYOUT.edge },
    }),
    jfa: material(jfaFrag, {
      uPrev: { value: null },
      uStep: { value: 1 },
      uSize: { value: new Vector2() },
    }),
    dist: material(distFrag, {
      uJfa: { value: null },
      uPrev: { value: null },
      uFresh: { value: 1 },
      uSize: { value: new Vector2() },
      uPerson: { value: null },
      uRate: { value: new Vector2(LAYOUT.followNear, LAYOUT.followFar) },
    }),
    mix: material(mixFrag, {
      uA: { value: null },
      uB: { value: null },
      uK: { value: 0 },
    }),
    seed: material(seedFrag, {
      uDist: { value: null },
      uAnaSize: { value: new Vector2() },
      uGrid: { value: new Vector4() },
      uWarp: { value: new Vector4() },
      uAspect: { value: 1 },
      uShape: { value: new Vector3() },
    }),
    mis: material(misFrag, {
      uSeeds: { value: null },
      uOld: { value: null },
      uHasOld: { value: 0 },
      uGrid: { value: new Vector4() },
      uGridSize: { value: new Vector2() },
      uSep: { value: 1 },
      uLast: { value: 0 },
    }),
    relax: material(relaxFrag, {
      uSeeds: { value: null },
      uGrid: { value: new Vector4() },
      uGridSize: { value: new Vector2() },
      uOn: { value: 1 },
    }),
    settle: material(settleFrag, {
      uNew: { value: null },
      uOld: { value: null },
      uHasOld: { value: 0 },
      uKeep: { value: new Vector2(LAYOUT.keepShift, LAYOUT.keepTurn) },
    }),
    blend: material(blendFrag, {
      uA: { value: null },
      uB: { value: null },
      uK: { value: 0 },
      uRows: { value: 0 },
      uDistA: { value: null },
      uDistB: { value: null },
      uFieldK: { value: 1 },
      uGrid: { value: new Vector4() },
      uWarp: { value: new Vector4() },
      uAspect: { value: 1 },
    }),
    colour: material(colourFrag, {
      uSeeds: { value: null },
      uCam: { value: null },
      uCamLinear: { value: 0 },
      uPrevCol: { value: null },
      uFresh: { value: 1 },
      uGrid: { value: new Vector4() },
      uWarp: { value: new Vector4() },
      uAspect: { value: 1 },
      uPalLab: { value: PALETTES[0].lab },
      uPalRgb: { value: PALETTES[0].rgb },
      uPalN: { value: PALETTES[0].n },
      uGoldN: { value: 0 },
      uGoldFrom: { value: 2 },
      uGrade: { value: new Vector4() },
      uLift: { value: 0 },
      uHist: { value: null },
      uPerson: { value: null },
      uTrail: { value: 0 },
    }),
    person: material(
      personFrag,
      {
        uRaw: { value: null },
        uHasRaw: { value: 0 },
        uRawTexel: { value: new Vector2(1 / 256, 1 / 256) },
        uPrev: { value: null },
        uFresh: { value: 1 },
        uBlend: { value: 0.3 },
        uAspect: { value: 1 },
        uFace: { value: new Vector4() },
        uCap: {
          value: Array.from({ length: MAX_CAPSULES }, () => new Vector4()),
        },
        uCapR: { value: new Array<number>(MAX_CAPSULES).fill(0) },
        uCapCount: { value: 0 },
      },
      { MAX_CAPSULES },
    ),
    hist: material(histFrag, {
      uCam: { value: null },
      uCamLinear: { value: 0 },
      uPerson: { value: null },
      uPrev: { value: null },
      uFresh: { value: 1 },
      uDrift: { value: new Vector2() },
      uKeep: { value: 1 },
    }),
  };

  /** The screen pass; the scene sets the per-frame uniforms. */
  readonly mosaic = material(mosaicFrag, {
    uAspect: { value: 1 },
    uRes: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uLight: { value: new Vector3(-0.35, 0.55, 1) },
    uCam: { value: null },
    uCamLinear: { value: 0 },
    uDistA: { value: null },
    uDistB: { value: null },
    uFieldK: { value: 1 },
    uAnaSize: { value: new Vector2(1, 1) },
    uSeeds0: { value: null },
    uCol0: { value: null },
    uGrid0: { value: new Vector4() },
    uGridSize0: { value: new Vector2() },
    uWarp0: { value: new Vector4() },
    uStyle0: { value: 0 },
    uSeeds1: { value: null },
    uCol1: { value: null },
    uGrid1: { value: new Vector4() },
    uGridSize1: { value: new Vector2() },
    uWarp1: { value: new Vector4() },
    uStyle1: { value: 0 },
    uChange: { value: 0 },
    uChangeT: { value: 0 },
    uOrigin: { value: new Vector3() },
    uRipple: { value: new Vector2(0.55, 1) },
    uShapeA: {
      value: STYLES.map(
        (s) => new Vector4(s.aspect, s.shards, s.sizeJitter, s.wobble),
      ),
    },
    uShapeB: {
      value: STYLES.map((s) => new Vector4(s.grout, s.bevel, s.tilt, s.glass)),
    },
    uFinish: {
      value: STYLES.map(
        (s) => new Vector4(s.grain, s.gloss, s.shine, s.sparkle),
      ),
    },
    uGroutCol: {
      value: STYLES.map((s) => new Vector3(...hexToLinear(s.groutColor))),
    },
    uGoldIdx: {
      value: STYLES.map((s) => (s.gold > 0 ? s.palette.length - s.gold : 16)),
    },
    uDebug: { value: 0 },
  });

  /** Layouts made recently (for the dev readout). */
  readonly stamps: number[] = [];

  constructor(gl: WebGLRenderer) {
    this.gl = gl;
    this.quad = new Mesh(new PlaneGeometry(1, 1), this.m.ana);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  dispose() {
    const all: WebGLRenderTarget[] = [
      ...this.ana,
      this.grad,
      ...this.jfa,
      ...this.dist,
      ...this.distFrom,
      ...this.person,
      ...this.hist,
      this.final,
    ];
    this.layouts.forEach((l) => {
      if (l) all.push(...l.raw, ...l.target, l.prev, l.now, ...l.col);
    });
    all.forEach((t) => t.dispose());
    Object.values(this.m).forEach((mat) => mat.dispose());
    this.mosaic.dispose();
    this.quad.geometry.dispose();
  }

  private draw(mat: ShaderMaterial, to: WebGLRenderTarget) {
    this.quad.material = mat;
    this.gl.setRenderTarget(to);
    this.gl.render(this.scene, this.camera);
  }

  /** The style's layout, sized for this screen and tile size (made on first use). */
  layoutFor(style: number, aspect: number, tileScale: number): Layout {
    const st = STYLES[style];
    const s = TILES.size * st.scale * tileScale;
    const g = st.shards > 0.5 ? s : s * SEED_GRID;
    const M = TILES.margin;
    const cols = Math.ceil(aspect / g) + 2 * M;
    const rows = Math.ceil(1 / g) + 2 * M;
    let l = this.layouts[style];
    if (!l) {
      l = {
        style,
        cols: 0,
        rows: 0,
        s,
        g,
        ox: 0,
        oy: 0,
        raw: pair(false),
        target: pair(false),
        ti: 0,
        prev: target(false),
        now: target(false),
        col: pair(false),
        ci: 0,
        warpPrev: new Vector4(0, 0, 1, 1),
        warpTarget: new Vector4(0, 0, 1, 1),
        warp: new Vector4(0, 0, 1, 1),
        at: -1,
        fresh: true,
        colFresh: true,
        usedAt: -1,
      };
      this.layouts[style] = l;
    }
    if (l.cols !== cols || l.rows !== rows || Math.abs(l.s - s) > 1e-9) {
      l.cols = cols;
      l.rows = rows;
      l.s = s;
      l.g = g;
      // Centre the grid on the screen.
      l.ox = (aspect - (cols - 2 * M) * g) / 2 - M * g;
      l.oy = (1 - (rows - 2 * M) * g) / 2 - M * g;
      [...l.raw, ...l.target, l.prev, l.now, ...l.col].forEach((t) =>
        t.setSize(cols, rows),
      );
      l.fresh = true;
      l.colFresh = true;
    }
    return l;
  }

  /** How far the distance field has eased to its newest version (0..1). */
  fieldK(now: number) {
    return glide((now - this.fieldAt) / LAYOUT.glide);
  }

  /** Read the picture's edges and their distance field (shared by every style). */
  analyse(cam: Texture, camLinear: boolean, aspect: number, now: number) {
    const h = LAYOUT.analysis;
    const w = Math.max(16, Math.round(h * aspect));
    if (this.anaSize.x !== w || this.anaSize.y !== h) {
      this.anaSize.set(w, h);
      [
        ...this.ana,
        this.grad,
        ...this.jfa,
        ...this.dist,
        ...this.distFrom,
      ].forEach((t) => t.setSize(w, h));
      this.anaFresh = true;
    }
    const fresh = this.anaFresh;
    const texel = new Vector2(1 / w, 1 / h);
    const a = this.m.ana.uniforms;
    a.uCam.value = cam;
    a.uCamLinear.value = camLinear ? 1 : 0;
    a.uPrev.value = this.ana[this.ai].texture;
    a.uFresh.value = fresh ? 1 : 0;
    (a.uTexel.value as Vector2).copy(texel);
    this.ai = 1 - this.ai;
    this.draw(this.m.ana, this.ana[this.ai]);
    this.anaFresh = false;

    const g = this.m.grad.uniforms;
    g.uAna.value = this.ana[this.ai].texture;
    (g.uTexel.value as Vector2).copy(texel);
    this.draw(this.m.grad, this.grad);

    const e = this.m.edge.uniforms;
    e.uGrad.value = this.grad.texture;
    (e.uTexel.value as Vector2).copy(texel);
    this.draw(this.m.edge, this.jfa[0]);

    // Jump flood: halving steps, then one more of 1 to tidy up.
    const j = this.m.jfa.uniforms;
    (j.uSize.value as Vector2).set(w, h);
    let read = 0;
    const steps: number[] = [];
    for (let st = 2 ** Math.floor(Math.log2(Math.max(w, h))); st >= 1; st /= 2)
      steps.push(st);
    steps.push(1);
    steps.forEach((st) => {
      j.uPrev.value = this.jfa[read].texture;
      j.uStep.value = st;
      this.draw(this.m.jfa, this.jfa[1 - read]);
      read = 1 - read;
    });

    // The field eases from where it is now to the new one.
    const mx = this.m.mix.uniforms;
    mx.uA.value = this.distFrom[this.dfi].texture;
    mx.uB.value = this.dist[this.di].texture;
    mx.uK.value = this.fieldK(now);
    this.dfi = 1 - this.dfi;
    this.draw(this.m.mix, this.distFrom[this.dfi]);
    const d = this.m.dist.uniforms;
    d.uJfa.value = this.jfa[read].texture;
    d.uPrev.value = this.dist[this.di].texture;
    d.uFresh.value = fresh ? 1 : 0;
    d.uPerson.value = this.person[this.pi].texture;
    (d.uSize.value as Vector2).set(w, h);
    this.di = 1 - this.di;
    this.draw(this.m.dist, this.dist[this.di]);
    if (fresh) {
      mx.uA.value = this.dist[this.di].texture;
      mx.uB.value = this.dist[this.di].texture;
      this.draw(this.m.mix, this.distFrom[this.dfi]);
    }
    this.fieldAt = now;
  }

  /**
   * You, steadied, at w × h, and your trail: `drift` is how far the old
   * picture moves this frame (uv), `keep` how much of it is left.
   */
  updatePerson(opts: {
    mask: Texture | null;
    face: Vector4;
    capsules: Capsules;
    aspect: number;
    blend: number;
    w: number;
    h: number;
    cam: Texture;
    camLinear: boolean;
    drift: Vector2;
    keep: number;
  }) {
    const { w, h } = opts;
    if (this.person[0].width !== w || this.person[0].height !== h) {
      [...this.person, ...this.hist].forEach((t) => t.setSize(w, h));
      this.personFresh = true;
    }
    const p = this.m.person.uniforms;
    p.uRaw.value = opts.mask;
    p.uHasRaw.value = opts.mask ? 1 : 0;
    const img = (
      opts.mask as { image?: { width?: number; height?: number } } | null
    )?.image;
    if (img?.width && img.height)
      (p.uRawTexel.value as Vector2).set(1 / img.width, 1 / img.height);
    p.uPrev.value = this.person[this.pi].texture;
    p.uFresh.value = this.personFresh ? 1 : 0;
    p.uBlend.value = opts.blend;
    p.uAspect.value = opts.aspect;
    (p.uFace.value as Vector4).copy(opts.face);
    const caps = p.uCap.value as Vector4[];
    const radii = p.uCapR.value as number[];
    for (let i = 0; i < opts.capsules.count; i += 1) {
      caps[i].fromArray(opts.capsules.seg, i * 4);
      radii[i] = opts.capsules.radius[i];
    }
    p.uCapCount.value = opts.capsules.count;
    this.pi = 1 - this.pi;
    this.draw(this.m.person, this.person[this.pi]);

    const hs = this.m.hist.uniforms;
    hs.uCam.value = opts.cam;
    hs.uCamLinear.value = opts.camLinear ? 1 : 0;
    hs.uPerson.value = this.person[this.pi].texture;
    hs.uPrev.value = this.hist[this.hi].texture;
    hs.uFresh.value = this.personFresh ? 1 : 0;
    (hs.uDrift.value as Vector2).copy(opts.drift);
    hs.uKeep.value = opts.keep;
    this.hi = 1 - this.hi;
    this.draw(this.m.hist, this.hist[this.hi]);
    this.personFresh = false;
  }

  /* eslint-disable no-param-reassign -- a layout is the pipeline's own state */
  /** Make a new layout for `l` from the last analysis; the tiles glide to it. */
  relayout(l: Layout, now: number, aspect: number, warp: Vector4) {
    const st = STYLES[l.style];
    const rows = st.shards < 0.5;
    const grid = new Vector4(l.ox, l.oy, l.g, l.s);
    const size = new Vector2(l.cols, l.rows);
    const sd = this.m.seed.uniforms;
    sd.uDist.value = this.dist[this.di].texture;
    (sd.uAnaSize.value as Vector2).copy(this.anaSize);
    (sd.uGrid.value as Vector4).copy(grid);
    (sd.uWarp.value as Vector4).copy(warp);
    sd.uAspect.value = aspect;
    (sd.uShape.value as Vector3).set(st.jitter, st.turn, rows ? 1 : 0);
    this.draw(this.m.seed, l.raw[0]);
    let r = 0;
    if (rows) {
      const mi = this.m.mis.uniforms;
      (mi.uGrid.value as Vector4).copy(grid);
      (mi.uGridSize.value as Vector2).copy(size);
      mi.uSep.value = 0.78 * st.aspect * l.s;
      mi.uOld.value = l.target[l.ti].texture;
      mi.uHasOld.value = l.fresh ? 0 : 1;
      for (let i = 0; i < 3; i += 1) {
        mi.uSeeds.value = l.raw[r].texture;
        mi.uLast.value = i === 2 ? 1 : 0;
        this.draw(this.m.mis, l.raw[1 - r]);
        r = 1 - r;
      }
      const rx = this.m.relax.uniforms;
      (rx.uGrid.value as Vector4).copy(grid);
      (rx.uGridSize.value as Vector2).copy(size);
      rx.uSeeds.value = l.raw[r].texture;
      this.draw(this.m.relax, l.raw[1 - r]);
      r = 1 - r;
    }

    const se = this.m.settle.uniforms;
    se.uNew.value = l.raw[r].texture;
    se.uOld.value = l.target[l.ti].texture;
    se.uHasOld.value = l.fresh ? 0 : 1;
    l.ti = 1 - l.ti;
    this.draw(this.m.settle, l.target[l.ti]);

    // Glide from where the tiles are now (or start right there).
    const b = this.m.blend.uniforms;
    b.uA.value = (l.fresh ? l.target[l.ti] : l.now).texture;
    b.uB.value = b.uA.value;
    b.uK.value = 0;
    b.uRows.value = 0;
    this.draw(this.m.blend, l.prev);
    if (l.fresh) {
      this.draw(this.m.blend, l.now);
      l.warpPrev.copy(warp);
      l.warp.copy(warp);
    } else {
      l.warpPrev.copy(l.warp);
    }
    l.warpTarget.copy(warp);
    l.at = now;
    l.fresh = false;
    this.stamps.push(now);
  }

  /** This frame: the tiles on their way, and each tile's stone from the live picture. */
  update(
    l: Layout,
    now: number,
    aspect: number,
    cam: Texture,
    camLinear: boolean,
  ) {
    const k = glide((now - l.at) / LAYOUT.glide);
    l.warp.lerpVectors(l.warpPrev, l.warpTarget, k);
    const b = this.m.blend.uniforms;
    b.uA.value = l.prev.texture;
    b.uB.value = l.target[l.ti].texture;
    b.uK.value = k;
    b.uRows.value = STYLES[l.style].shards < 0.5 ? 1 : 0;
    b.uDistA.value = this.distFrom[this.dfi].texture;
    b.uDistB.value = this.dist[this.di].texture;
    b.uFieldK.value = this.fieldK(now);
    (b.uGrid.value as Vector4).set(l.ox, l.oy, l.g, l.s);
    (b.uWarp.value as Vector4).copy(l.warp);
    b.uAspect.value = aspect;
    this.draw(this.m.blend, l.now);

    const st = STYLES[l.style];
    const pal = PALETTES[l.style];
    const c = this.m.colour.uniforms;
    c.uSeeds.value = l.now.texture;
    c.uCam.value = cam;
    c.uCamLinear.value = camLinear ? 1 : 0;
    c.uPrevCol.value = l.col[l.ci].texture;
    c.uFresh.value = l.colFresh ? 1 : 0;
    (c.uGrid.value as Vector4).set(l.ox, l.oy, l.g, l.s);
    (c.uWarp.value as Vector4).copy(l.warp);
    c.uAspect.value = aspect;
    c.uPalLab.value = pal.lab;
    c.uPalRgb.value = pal.rgb;
    c.uPalN.value = pal.n;
    c.uGoldN.value = st.gold;
    c.uGoldFrom.value = st.goldFrom;
    (c.uGrade.value as Vector4).set(
      st.contrast,
      st.saturation,
      st.chroma,
      0.05,
    );
    c.uLift.value = st.lift;
    c.uHist.value = this.hist[this.hi].texture;
    c.uPerson.value = this.person[this.pi].texture;
    c.uTrail.value = this.personFresh ? 0 : this.trail;
    l.ci = 1 - l.ci;
    this.draw(this.m.colour, l.col[l.ci]);
    l.colFresh = false;
  }
  /* eslint-enable no-param-reassign */

  /** Point the screen pass's layer 0 or 1 at a layout. */
  bindLayer(i: 0 | 1, l: Layout) {
    const u = this.mosaic.uniforms;
    u[`uSeeds${i}`].value = l.now.texture;
    u[`uCol${i}`].value = l.col[l.ci].texture;
    (u[`uGrid${i}`].value as Vector4).set(l.ox, l.oy, l.g, l.s);
    (u[`uGridSize${i}`].value as Vector2).set(l.cols, l.rows);
    (u[`uWarp${i}`].value as Vector4).copy(l.warp);
    u[`uStyle${i}`].value = l.style;
  }

  /** Draw the mosaic into `final` at w × h pixels. */
  render(w: number, h: number, now: number) {
    if (this.final.width !== w || this.final.height !== h)
      this.final.setSize(w, h);
    const u = this.mosaic.uniforms;
    (u.uRes.value as Vector2).set(w, h);
    u.uDistA.value = this.distFrom[this.dfi].texture;
    u.uDistB.value = this.dist[this.di].texture;
    u.uFieldK.value = this.fieldK(now);
    (u.uAnaSize.value as Vector2).copy(this.anaSize);
    this.draw(this.mosaic, this.final);
  }

  /** Dev: the steadied person mask, read back (RGBA bytes). */
  readPerson() {
    const t = this.person[this.pi];
    const buf = new Uint8Array(t.width * t.height * 4);
    this.gl.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf);
    return { w: t.width, h: t.height, buf };
  }

  /** Dev: the drawn mosaic, read back (RGBA bytes). */
  readFinal() {
    const t = this.final;
    const buf = new Uint8Array(t.width * t.height * 4);
    this.gl.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf);
    return { w: t.width, h: t.height, buf };
  }
}

/** The face magnifier for a layout: centre, reach, magnification (screen heights). */
export const faceWarp = (
  face: { x: number; y: number; w: number; h: number } | null,
  aspect: number,
  out: Vector4,
) => {
  if (!face) return out.set(aspect / 2, 0.5, 0.5, 1);
  const size = Math.max(face.w * aspect, face.h);
  return out.set(
    face.x * aspect,
    face.y,
    Math.max(0.05, size * FACE.reach),
    1 / FACE.detail,
  );
};
