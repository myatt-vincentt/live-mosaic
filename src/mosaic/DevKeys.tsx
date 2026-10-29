// Development only (Scene.tsx lazy-loads this behind a NODE_ENV check).
//   1–4  pick a style (the change ripples from the left)
//   [ ]  smaller / larger tiles
//   d    cycle: mosaic · the tile layout (a random colour per tile) · the rows
// Also `window.__mosaic` for scripted checks: `style`, `tiles`,
// `layoutRate`, `swipe`, `setStyle(i)`, `swipeTo(dir)`, `tileScale(k)`,
// `view(n)`, `scale(k)`, `trail`, `personShare()`, and `layoutChange(frames)` (how much of the tile layout
// changes from frame to frame).
import { useEffect } from "react";

import { handSwipe } from "./HandSwipe";
import { mosaicDebug } from "./Mosaic";
import { mosaicState, setStyle, setTileScale, swipeStyle } from "./state";
import { STYLES } from "./styles";

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const debug = {
  state: mosaicState,
  get style() {
    return STYLES[mosaicState.style].id;
  },
  get changing() {
    return !!mosaicState.change;
  },
  /** Tiles in the layout on screen. */
  get tiles() {
    const l = mosaicDebug.base;
    return l ? { cols: l.cols, rows: l.rows, count: l.cols * l.rows } : null;
  },
  /** New layouts in the last second. */
  get layoutRate() {
    const p = mosaicDebug.pipe;
    if (!p) return 0;
    const now = performance.now() / 1000;
    while (p.stamps.length && now - p.stamps[0] > 1) p.stamps.shift();
    return p.stamps.length;
  },
  get swipe() {
    const s = handSwipe.state;
    return {
      vx: Number(s.vx.toFixed(3)),
      armed: s.armed,
      running: s.run ? s.run.dir : 0,
      fired: s.fired,
      lastDir: s.lastDir,
      hand: !!s.last,
    };
  },
  /** The drawn mosaic, read back (RGBA bytes). */
  _readFinal: () => mosaicDebug.pipe?.readFinal(),
  /** When the last layout was made (s). */
  get layoutStamp() {
    const st = mosaicDebug.pipe?.stamps;
    return st && st.length ? Number(st[st.length - 1].toFixed(3)) : -1;
  },
  /** The trail now: how much it shows, how long it lasts (s), the motion speed. */
  get trail() {
    return { ...mosaicDebug.trail };
  },
  /** The steadied person mask: share of the screen that is you. */
  personShare() {
    const p = mosaicDebug.pipe;
    if (!p) return 0;
    const { w, h, buf } = p.readPerson();
    let on = 0;
    for (let i = 0; i < w * h; i += 1) if (buf[i * 4] > 127) on += 1;
    return on / (w * h);
  },
  get render() {
    return {
      width: mosaicDebug.size.x,
      height: mosaicDebug.size.y,
      view: [mosaicDebug.view.x, mosaicDebug.view.y],
    };
  },
  setStyle: (i: number) => setStyle(i, { kind: "side", side: "left" }),
  swipeTo: (dir: -1 | 1) => swipeStyle(dir),
  tileScale: (k: number) => setTileScale(k),
  view: (n: number) => {
    mosaicDebug.debugView = n;
  },
  scale: (k: number) => {
    mosaicDebug.scale = k;
  },
  /**
   * Watch the tile layout for `frames` frames (the layout view is shown
   * meanwhile: each tile a fixed random colour). Returns the share of the
   * screen whose tile changed from one frame to the next (mean and worst
   * frame), split between you (the steadied person mask) and the background,
   * and the share that changed at all over the whole time.
   */
  async layoutChange(frames = 60) {
    const p = mosaicDebug.pipe;
    if (!p) return null;
    const before = mosaicDebug.debugView;
    mosaicDebug.debugView = 1;
    await nextFrame();
    await nextFrame();
    let prev: Uint8Array | null = null;
    let first: Uint8Array | null = null;
    const sums = { you: 0, bg: 0, worst: 0, n: 0 };
    let last: Uint8Array | null = null;
    let w = 0;
    let h = 0;
    let you: Uint8Array | null = null;
    let pw = 0;
    let ph = 0;
    for (let f = 0; f < frames; f += 1) {
      // eslint-disable-next-line no-await-in-loop -- one read per frame
      await nextFrame();
      const img = p.readFinal();
      ({ w, h } = img);
      if (!you) {
        const m = p.readPerson();
        you = m.buf;
        pw = m.w;
        ph = m.h;
      }
      if (prev && prev.length === img.buf.length) {
        let cy = 0;
        let ny = 0;
        let cb = 0;
        let nb = 0;
        for (let y = 0; y < h; y += 2) {
          for (let x = 0; x < w; x += 2) {
            const i = (y * w + x) * 4;
            const changed =
              img.buf[i] !== prev[i] ||
              img.buf[i + 1] !== prev[i + 1] ||
              img.buf[i + 2] !== prev[i + 2];
            const mi =
              (Math.floor((y / h) * ph) * pw + Math.floor((x / w) * pw)) * 4;
            if (you[mi] > 127) {
              ny += 1;
              if (changed) cy += 1;
            } else {
              nb += 1;
              if (changed) cb += 1;
            }
          }
        }
        sums.you += ny ? cy / ny : 0;
        sums.bg += nb ? cb / nb : 0;
        sums.worst = Math.max(sums.worst, (cy + cb) / Math.max(1, ny + nb));
        sums.n += 1;
      } else first = img.buf;
      prev = img.buf;
      last = img.buf;
    }
    mosaicDebug.debugView = before;
    let ever = 0;
    let all = 0;
    if (first && last) {
      for (let i = 0; i < last.length; i += 8) {
        all += 1;
        if (last[i] !== first[i] || last[i + 1] !== first[i + 1]) ever += 1;
      }
    }
    const n = Math.max(1, sums.n);
    return {
      perFrameYou: sums.you / n,
      perFrameBackground: sums.bg / n,
      worstFrame: sums.worst,
      changedOverall: all ? ever / all : 0,
    };
  },
};

const DevKeys = () => {
  useEffect(() => {
    (window as unknown as { __mosaic: typeof debug }).__mosaic = debug;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= STYLES.length) debug.setStyle(n - 1);
      else if (e.key === "[") setTileScale(mosaicState.tileScale / 1.15);
      else if (e.key === "]") setTileScale(mosaicState.tileScale * 1.15);
      else if (e.key === "d") debug.view((mosaicDebug.debugView + 1) % 3);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      delete (window as unknown as { __mosaic?: typeof debug }).__mosaic;
    };
  }, []);
  return null;
};

export default DevKeys;
