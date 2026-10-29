// The only hint, wordless: a small see-through ghost hand low in the centre
// (the SDK's HandGestureHint, open palm) sweeping sideways across, over and
// over. It goes for good after the first style change.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { defineGltfAsset, useXRAsset } from "@vincentt-xr/sdk";
import { HandGestureHint } from "@vincentt-xr/sdk/instructions";

import { mosaicState } from "./state";

const HINT = {
  /** Seconds after the start before it shows. */
  delay: 1.5,
  /** One sweep: fade in, sweep across, fade out, rest (seconds). */
  fadeIn: 0.35,
  sweep: 0.8,
  fadeOut: 0.35,
  rest: 0.9,
  /** Sweep from x = +reach to −reach (world units at z = 0), at this height. */
  reach: 0.42,
  y: -1.2,
  height: 0.46,
  /** Fade when it goes for good. */
  leave: 0.4,
  renderOrder: 40,
};

const handAsset = defineGltfAsset("/models/hand-v1.glb");
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const LOOK = { halo: false as const, glow: false as const };

export const Hint = () => {
  const { value: hand } = useXRAsset(handAsset);
  const g = useRef<Group>(null);
  const t0 = useRef(-1);
  const goneAt = useRef(-1);
  const done = useRef(false);

  useFrame((state) => {
    const o = g.current;
    if (!o || done.current) return;
    const t = state.clock.elapsedTime;
    if (t0.current < 0) t0.current = t;
    const age = t - t0.current - HINT.delay;
    if (mosaicState.changes > 0 && goneAt.current < 0) goneAt.current = t;
    if (age < 0) {
      o.visible = false;
      return;
    }
    const cycle = HINT.fadeIn + HINT.sweep + HINT.fadeOut + HINT.rest;
    const c = age % cycle;
    const across = easeOut((c - HINT.fadeIn) / HINT.sweep);
    let k = easeOut(c / HINT.fadeIn);
    if (c > HINT.fadeIn + HINT.sweep)
      k = 1 - easeOut((c - HINT.fadeIn - HINT.sweep) / HINT.fadeOut);
    if (goneAt.current >= 0) {
      const out = (t - goneAt.current) / HINT.leave;
      k = Math.min(k, 1 - easeOut(out));
      if (out >= 1) {
        done.current = true;
        o.visible = false;
        return;
      }
    }
    o.position.x = HINT.reach * (1 - 2 * across);
    o.visible = k > 0.001;
    o.scale.setScalar(Math.max(1e-4, 0.85 + 0.15 * k) * k);
  });

  if (!hand) return null;
  return (
    <group ref={g} position={[HINT.reach, HINT.y, 0]} visible={false}>
      <HandGestureHint
        gesture="palm"
        model={hand.scene}
        poses={hand.animations}
        height={HINT.height}
        look={LOOK}
        orbit={0}
        renderOrder={HINT.renderOrder}
      />
    </group>
  );
};
