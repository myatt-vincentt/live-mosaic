// The live mosaic over the whole picture. Drawn just above App.tsx's
// VideoBackground (GROUNDING.md, camera effects) and covering it.
//
// A few times a second the tiles are re-laid along the picture's contours;
// in between they stay put and glide to the new layout, while every tile
// takes its stone colour from the live picture each frame. A style change
// lays the new style's tiles over the old ones, popping in tile by tile from
// where the change started.
//
// When you move, your tiles leave a soft trail: the tiles where you just
// were keep your old colours for a moment, drifting a little after you with
// a gentle sway, and fade back to what is behind you. The bigger the move,
// the longer the trail; standing still, there is none. Only you trail: the
// person is the steadied portrait mask, trusted only around the tracked face,
// body and hands.
import { useEffect, useMemo, useRef } from "react";
import {
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { usePersonMaskTexture } from "@vincentt-xr/sdk";
import { useXRCameraTexture } from "@vincentt-xr/sdk/low-level";
import { useFaceInfo } from "@vincentt-xr/sdk/tracking";

import { FACE, LAYOUT, RENDER, RIPPLE, TRAIL } from "./config";
import { faceWarp, MosaicPipeline, type Layout } from "./pipeline";
import { blitFrag, flatVert } from "./shaders";
import { buildCapsules, createCapsules } from "./sim/gate";
import { faceState, handState, mosaicState } from "./state";

/** Read by the dev tools (development only). */
export const mosaicDebug = {
  pipe: null as MosaicPipeline | null,
  base: null as Layout | null,
  /** The drawn mosaic's size in pixels. */
  size: new Vector2(),
  aspect: 1,
  view: new Vector2(),
  debugView: 0,
  /** Override for the pixel scale (0 = automatic). */
  scale: 0,
  /** The trail now: how much it shows, how long it lasts (s), the motion speed. */
  trail: { show: 0, seconds: 0, speed: 0 },
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The face's place, turn and speed, for the smaller tiles, the light and the trail. */
const FaceFocus = () => {
  const face = useFaceInfo({ targetFps: FACE.fps });
  useEffect(() => {
    const b = face?.bounds;
    const now = performance.now();
    const f = faceState;
    if (b) {
      // Eased first: the face box jitters a little from frame to frame.
      const raw = { x: b.centerX, y: 1 - b.centerY, w: b.width, h: b.height };
      const prev = f.face;
      const dt = (now - f.seenAt) / 1000;
      const next =
        prev && dt < 0.3
          ? {
              x: prev.x + (raw.x - prev.x) * 0.5,
              y: prev.y + (raw.y - prev.y) * 0.5,
              w: prev.w + (raw.w - prev.w) * 0.3,
              h: prev.h + (raw.h - prev.h) * 0.3,
            }
          : raw;
      if (prev && dt > 0 && dt < 0.3) {
        f.vx += ((next.x - prev.x) / dt - f.vx) * 0.4;
        f.vy += ((next.y - prev.y) / dt - f.vy) * 0.4;
      } else {
        f.vx = 0;
        f.vy = 0;
      }
      f.face = next;
      f.seenAt = now;
    } else {
      f.face = null;
      f.vx = 0;
      f.vy = 0;
    }
    if (face) {
      f.yaw += (face.pose.rotation.y - f.yaw) * 0.5;
      f.pitch += (face.pose.rotation.x - f.pitch) * 0.5;
    }
  }, [face]);
  return null;
};

export const Mosaic = () => {
  const gl = useThree((s) => s.gl);
  const cam = useXRCameraTexture();
  const { texture: mask } = usePersonMaskTexture();
  const pipe = useMemo(() => new MosaicPipeline(gl), [gl]);
  const blit = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uMap: { value: pipe.final.texture } },
        vertexShader: flatVert,
        fragmentShader: blitFrag,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [pipe],
  );
  useEffect(() => {
    mosaicDebug.pipe = pipe;
    return () => {
      mosaicDebug.pipe = null;
      pipe.dispose();
      blit.dispose();
    };
  }, [pipe, blit]);

  const lastLayout = useRef(-1);
  const warp = useMemo(() => new Vector4(), []);
  const light = useMemo(() => new Vector3(), []);
  const trail = useMemo(
    () => ({
      capsules: createCapsules(),
      face: new Vector4(),
      drift: new Vector2(),
      speed: 0,
      show: 0,
      seconds: TRAIL.shortest,
      dirX: 1,
      dirY: 0,
    }),
    [],
  );

  useFrame((state, rawDt) => {
    if (!cam) return;
    const dt = Math.min(rawDt, 0.1);
    const now = performance.now() / 1000;
    const t = state.clock.elapsedTime;
    const { width, height } = state.size;
    const aspect = width / Math.max(1, height);
    const camLinear = cam.colorSpace === SRGBColorSpace;
    const s = mosaicState;
    const u = pipe.mosaic.uniforms;

    // You and your trail. The trail follows how fast you move (the face, or
    // a hand if that is faster): quick to come, slow to go.
    const f = faceState.face;
    trail.face.set(f ? f.x : 0, f ? f.y : 0, f ? f.w : 0, f ? f.h : 0);
    buildCapsules(trail.capsules, handState.hands, aspect);
    const fvx = faceState.vx * aspect;
    const fvy = faceState.vy;
    const hvx = handState.vx * aspect;
    const hvy = handState.vy;
    const fs = Math.hypot(fvx, fvy);
    const hs = Math.hypot(hvx, hvy) * TRAIL.handWeight;
    const vx = fs >= hs ? fvx : hvx * TRAIL.handWeight;
    const vy = fs >= hs ? fvy : hvy * TRAIL.handWeight;
    const speed = Math.max(fs, hs);
    trail.speed += (speed - trail.speed) * (1 - Math.exp(-8 * dt));
    if (trail.speed > 0.02) {
      trail.dirX = vx / Math.max(speed, 1e-4);
      trail.dirY = vy / Math.max(speed, 1e-4);
    }
    const want = smooth(TRAIL.from, TRAIL.full, trail.speed);
    const rate = want > trail.show ? TRAIL.rise : TRAIL.fall;
    trail.show += (want - trail.show) * (1 - Math.exp(-rate * dt));
    const target =
      TRAIL.shortest +
      (TRAIL.longest - TRAIL.shortest) *
        smooth(TRAIL.from, TRAIL.full * 2, trail.speed);
    trail.seconds += (target - trail.seconds) * (1 - Math.exp(-3 * dt));
    // The old picture drifts after you, slower than you, with a sway across.
    const sway = Math.sin(t * TRAIL.swayRate) * TRAIL.sway * trail.show;
    trail.drift.set(
      ((vx * TRAIL.follow - trail.dirY * sway) * dt) / aspect,
      (vy * TRAIL.follow + trail.dirX * sway) * dt,
    );
    const pk = Math.min(TRAIL.scale, TRAIL.maxHeight / Math.max(1, height));
    pipe.updatePerson({
      mask: mask ?? null,
      face: trail.face,
      capsules: trail.capsules,
      aspect,
      blend: 1 - Math.exp(-TRAIL.maskRate * dt),
      w: Math.max(16, Math.round(width * pk)),
      h: Math.max(16, Math.round(height * pk)),
      cam,
      camLinear,
      drift: trail.drift,
      keep: Math.exp(-dt / trail.seconds),
    });
    pipe.trail = trail.show;
    mosaicDebug.trail.show = trail.show;
    mosaicDebug.trail.seconds = trail.seconds;
    mosaicDebug.trail.speed = trail.speed;

    // The style change rippling across, if any.
    const ch = s.change;
    if (ch && ch.start < 0) ch.start = now;
    if (ch && now - ch.start > RIPPLE.travel + RIPPLE.pop + 0.05)
      s.change = null;
    const live = s.change;
    const base = pipe.layoutFor(
      live ? live.from : s.style,
      aspect,
      s.tileScale,
    );
    const incoming = live ? pipe.layoutFor(live.to, aspect, s.tileScale) : null;
    const used = incoming ? [base, incoming] : [base];
    // A layout coming back after a rest starts clean.
    used.forEach((l) => {
      const L = l;
      if (L.usedAt < 0 || now - L.usedAt > 0.5) {
        L.fresh = true;
        L.colFresh = true;
      }
      L.usedAt = now;
    });

    if (
      now - lastLayout.current >= 1 / LAYOUT.rate ||
      used.some((l) => l.fresh)
    ) {
      pipe.analyse(cam, camLinear, aspect, now);
      faceWarp(faceState.face, aspect, warp);
      used.forEach((l) => pipe.relayout(l, now, aspect, warp));
      lastLayout.current = now;
    }
    used.forEach((l) => pipe.update(l, now, aspect, cam, camLinear));

    pipe.bindLayer(0, base);
    u.uChange.value = 0;
    if (incoming && live) {
      pipe.bindLayer(1, incoming);
      u.uChange.value = 1;
      u.uChangeT.value = now - live.start;
      const o = u.uOrigin.value as Vector3;
      const r = u.uRipple.value as Vector2;
      r.x = RIPPLE.travel;
      if (live.origin.kind === "side") {
        o.set(0, 0, live.origin.side === "left" ? 1 : 2);
      } else {
        const ox = live.origin.x * aspect;
        const oy = live.origin.y;
        o.set(ox, oy, 0);
        r.y = Math.max(
          Math.hypot(ox, oy),
          Math.hypot(aspect - ox, oy),
          Math.hypot(ox, 1 - oy),
          Math.hypot(aspect - ox, 1 - oy),
        );
      }
    }

    // The light on the tiles follows the head, so gloss and gold shimmer.
    light.set(
      -0.35 + faceState.yaw * 1.8 + 0.06 * Math.sin(t * 0.5),
      0.55 + faceState.pitch * 1.8 + 0.05 * Math.cos(t * 0.37),
      1,
    );
    (u.uLight.value as Vector3).copy(light);
    u.uAspect.value = aspect;
    u.uTime.value = t;
    u.uCam.value = cam;
    u.uCamLinear.value = camLinear ? 1 : 0;
    u.uDebug.value = mosaicDebug.debugView;

    // Drawn at a capped resolution, then stretched over the screen.
    let k = mosaicDebug.scale || Math.min(state.viewport.dpr, RENDER.maxScale);
    k = Math.min(k, Math.sqrt(RENDER.maxPixels / Math.max(1, width * height)));
    const w = Math.max(16, Math.round(width * k));
    const h = Math.max(16, Math.round(height * k));
    pipe.render(w, h, now);
    gl.setRenderTarget(null);

    mosaicDebug.base = base;
    mosaicDebug.size.set(w, h);
    mosaicDebug.aspect = aspect;
    mosaicDebug.view.set(width, height);
  }, -0.5);

  if (!cam) return null; // tracker / media startup and source swaps
  return (
    <>
      <FaceFocus />
      <mesh
        name="mosaic"
        material={blit}
        renderOrder={-998}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
};
