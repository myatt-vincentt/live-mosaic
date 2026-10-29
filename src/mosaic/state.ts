// What the mosaic is doing: the active style, the change rippling across it,
// and the tile size. The chips read the style with useSyncExternalStore; the
// GPU passes read the rest every frame.
import { useSyncExternalStore } from "react";

import { STYLE_COUNT } from "./styles";

/** Where a style change starts: a screen side (a swipe) or a point (a chip). */
export type RippleFrom =
  | { kind: "side"; side: "left" | "right" }
  | { kind: "point"; x: number; y: number };

export type Change = {
  from: number;
  to: number;
  origin: RippleFrom;
  /** Seconds (performance clock) when it started; −1 = waiting for the next frame. */
  start: number;
};

export const mosaicState = {
  style: 0,
  /** The change rippling across the mosaic right now, if any. */
  change: null as Change | null,
  /** Style changes so far (the hint goes after the first). */
  changes: 0,
  /** Tile size multiplier (1 = default). */
  tileScale: 1,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Switch to style `to`, rippling out from `origin`. */
export const setStyle = (to: number, origin: RippleFrom) => {
  const s = mosaicState;
  const next = ((to % STYLE_COUNT) + STYLE_COUNT) % STYLE_COUNT;
  // A change still rippling finishes at once, so the new one starts clean.
  const from = s.change ? s.change.to : s.style;
  if (next === from && !s.change) return;
  s.change = { from, to: next, origin, start: -1 };
  s.style = next;
  s.changes += 1;
  emit();
};

/**
 * A sideways swipe: `dir` is the way the hand (or finger) moved, −1 to the
 * screen's left, +1 to the right. A swipe to the left brings the next style,
 * like turning a page; the ripple follows the hand from the side it started.
 */
export const swipeStyle = (dir: -1 | 1) => {
  setStyle(mosaicState.style + (dir < 0 ? 1 : -1), {
    kind: "side",
    side: dir < 0 ? "right" : "left",
  });
};

export const setTileScale = (k: number) => {
  mosaicState.tileScale = Math.min(2.5, Math.max(0.5, k));
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getStyle = () => mosaicState.style;

export const useStyle = () =>
  useSyncExternalStore(subscribe, getStyle, getStyle);

/** The face, for the smaller tiles there and the light on the tiles. */
export const faceState = {
  /** Centre x, y (screen uv, y up) and size (share of width, height); null = no face. */
  face: null as { x: number; y: number; w: number; h: number } | null,
  /** Head turn and nod (radians), eased. */
  yaw: 0,
  pitch: 0,
  /** How fast the face moves (screen heights per second, x right, y up), and when it was last seen (ms). */
  vx: 0,
  vy: 0,
  seenAt: -1,
};

/** The tracked hands this frame: 21 points each in screen uv (y up), and the fastest palm's speed. */
export const handState = {
  hands: [] as { x: number; y: number }[][],
  vx: 0,
  vy: 0,
};
