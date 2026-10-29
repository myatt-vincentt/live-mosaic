// A sideways sweep of the hand changes the style: to the left for the next
// one, to the right for the one before. One hand drives it at a time,
// followed by its own identity (the SDK's `poses.left` / `poses.right`), so a
// second hand in view can't make the reading jump. Only fresh detections
// count (the SDK holds a lost hand's last pose for a moment).
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { XRModel } from "@vincentt-xr/sdk";
import {
  measureOpenPalm,
  useXRModelNode,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";
import { HandTracker } from "@vincentt-xr/sdk/tracking";

import { feedSwipe, swipeState } from "./sim/swipe";
import { handState, swipeStyle } from "./state";

/** Hand tracking rate: a sweep still spans several detections at this rate. */
export const HAND_FPS = 15;

/** How open the hand must be to swipe (a fist or a thumbs-up never does). */
const OPEN = 0.55;

/** The palm: wrist and the four knuckles (MediaPipe hand points). */
const PALM = [0, 5, 9, 13, 17];

type Side = "left" | "right";

/** The detector, shared with the dev readout. */
export const handSwipe = { state: swipeState() };

export const HandSwipe = () => {
  const hands = useXRModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const side = useRef<Side | null>(null);
  const lastStamp = useRef(-1);

  useFrame(() => {
    const poses = hands?.poses;
    const live = (s: Side) => {
      const h = poses?.[s];
      return h && !h.held && h.image.length > 20 ? h : null;
    };
    // Every hand in view, for where the person is (screen uv, y up).
    handState.hands = (["left", "right"] as const)
      .map((sd) => live(sd))
      .filter((h): h is NonNullable<typeof h> => !!h)
      .map((h) =>
        h.image.map((p) => ({ x: p.x * 0.5 + 0.5, y: p.y * 0.5 + 0.5 })),
      );
    let s: Side | null =
      side.current && live(side.current) ? side.current : null;
    if (!s) s = (live("right") && "right") || (live("left") && "left") || null;
    if (s !== side.current) {
      side.current = s;
      feedSwipe(handSwipe.state, performance.now(), null);
    }
    const hand = s ? live(s) : null;
    if (!hand) {
      handState.vx = 0;
      handState.vy = 0;
    }
    if (!hand || hand.timestampMs === lastStamp.current) return;
    lastStamp.current = hand.timestampMs;
    // Tracker points: centre origin, y up → screen fractions (y down).
    let x = 0;
    let y = 0;
    PALM.forEach((i) => {
      x += hand.image[i].x;
      y += hand.image[i].y;
    });
    x /= PALM.length;
    y /= PALM.length;
    const open = measureOpenPalm(hand.image) >= OPEN;
    const dir = feedSwipe(
      handSwipe.state,
      hand.timestampMs,
      open ? { x: x * 0.5 + 0.5, y: 0.5 - y * 0.5 } : null,
    );
    // The palm's speed (screen widths and heights per second), for the trail.
    handState.vx = handSwipe.state.vx;
    handState.vy = -handSwipe.state.vy;
    if (dir) swipeStyle(dir);
  });

  return <HandTracker targetFps={HAND_FPS} />;
};
