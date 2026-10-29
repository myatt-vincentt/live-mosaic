// A finger (or mouse) drag across the screen changes the style like the air
// swipe: drag left for the next one. Taps on the chips don't reach the
// canvas, so they never count.
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

import { swipeStyle } from "./state";

const DRAG = {
  /** Least sideways travel, px. */
  distance: 50,
  /** Sideways travel must beat vertical by this factor. */
  straightness: 1.5,
  /** Longest drag that still counts, ms. */
  time: 700,
};

export const TouchSwipe = () => {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    let start: { x: number; y: number; t: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      start = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        id: e.pointerId,
      };
    };
    const up = (e: PointerEvent) => {
      const s = start;
      start = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (
        Math.abs(dx) >= DRAG.distance &&
        Math.abs(dx) >= Math.abs(dy) * DRAG.straightness &&
        performance.now() - s.t <= DRAG.time
      )
        swipeStyle(dx < 0 ? -1 : 1);
    };
    const cancel = () => {
      start = null;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [gl]);
  return null;
};
