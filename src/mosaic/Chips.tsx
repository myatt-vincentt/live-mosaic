// The four styles as wordless glass chips in the control band at the
// bottom (Night glass). Each chip is a tiny swatch of its own tiles; the
// active one wears the Arles ring. A tap ripples the new style out from the
// chip.
import { useMemo } from "react";
import { Html } from "@react-three/drei";

import { setStyle, useStyle } from "./state";
import { STYLES, type MosaicStyle } from "./styles";

const ARLES = "#f4d968";

const CSS = `
.lm-root { position: absolute; inset: 0; pointer-events: none;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
.lm-scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 160px;
  background: linear-gradient(rgb(35 37 40 / 0), rgb(35 37 40 / .5)); }
.lm-band { position: absolute; left: 50%; transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom) + 24px);
  display: flex; gap: 12px; padding: 6px; border-radius: 999px; }
.lm-glass { background: rgb(35 37 40 / .64);
  backdrop-filter: blur(20px) saturate(1.5); -webkit-backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgb(235 246 253 / .18);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / .22), 0 8px 24px rgb(0 0 0 / .22); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .lm-glass { background: rgb(35 37 40 / .82); } }
.lm-chip { pointer-events: auto; position: relative; width: 48px; height: 48px; border-radius: 50%;
  border: 0; padding: 0; margin: 0; background: transparent; cursor: pointer; outline: none;
  touch-action: manipulation;
  transition: transform 160ms ease-out, box-shadow 160ms ease-out; }
.lm-chip:active { transform: scale(0.96); }
.lm-chip:focus-visible { box-shadow: 0 0 0 2px ${ARLES}; }
.lm-chip .lm-swatch { position: absolute; inset: 4px; border-radius: 50%; background-size: cover;
  box-shadow: inset 0 2px 4px rgb(255 255 255 / .3), inset 0 -3px 5px rgb(0 0 0 / .3); }
.lm-chip.on { box-shadow: 0 0 0 2px ${ARLES}; }
@media (prefers-reduced-motion: reduce) { .lm-chip:active { transform: none; } }
`;

/** A small repeatable random sequence, so each swatch looks the same every time. */
const random = (seed: number) => {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
};

/** Which stones each swatch shows (palette numbers). */
const SWATCH_STONES: Record<MosaicStyle["id"], number[]> = {
  roman: [2, 3, 4, 5, 7, 8, 10],
  delft: [0, 1, 3, 5, 6],
  smalti: [0, 1, 2, 4, 5, 7, 11, 12, 11],
  trencadis: [1, 2, 3, 4, 5, 6, 9],
};

/** A tiny picture of a style's tiles: its stones, shape and grout. */
const swatch = (style: MosaicStyle, seed: number) => {
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const rnd = random(seed);
  const pal = style.palette;
  const pick = (from: number[]) => pal[from[Math.floor(rnd() * from.length)]];
  ctx.fillStyle = style.groutColor;
  ctx.fillRect(0, 0, size, size);
  if (style.shards > 0.5) {
    // Broken tiles: angular shards on wide grout.
    const cells = 4;
    const c = size / cells;
    for (let j = 0; j < cells; j += 1) {
      for (let i = 0; i < cells; i += 1) {
        const pts = Array.from({ length: 5 }, (_, k) => {
          const a = (k / 5) * Math.PI * 2 + rnd() * 0.8;
          const r = c * (0.32 + rnd() * 0.12);
          return [
            (i + 0.5) * c + Math.cos(a) * r,
            (j + 0.5) * c + Math.sin(a) * r,
          ];
        });
        ctx.fillStyle = pick([1, 2, 3, 4, 5, 6, 9]);
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      }
    }
  } else {
    // Rows of tiles, gently curved like the rows in the mosaic.
    const rows = style.scale > 1.2 ? 4 : 6;
    const h = size / rows;
    const gap = Math.max(1.5, h * style.grout);
    const colours = SWATCH_STONES[style.id];
    for (let j = 0; j < rows; j += 1) {
      let x = -rnd() * h;
      while (x < size) {
        const w = h * style.aspect * (0.85 + rnd() * 0.3);
        const y = j * h + Math.sin((x / size) * Math.PI) * h * 0.25;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((rnd() - 0.5) * style.turn * 2);
        ctx.fillStyle = pick(colours);
        ctx.fillRect(-w / 2 + gap / 2, -h / 2 + gap / 2, w - gap, h - gap);
        ctx.restore();
        x += w;
      }
    }
  }
  return canvas.toDataURL();
};

export const Chips = () => {
  const active = useStyle();
  const pictures = useMemo(
    () => STYLES.map((s, i) => swatch(s, 7 + i * 31)),
    [],
  );
  return (
    <Html fullscreen zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <style>{CSS}</style>
      <div className="lm-root">
        <div className="lm-scrim" />
        <div className="lm-band lm-glass" role="radiogroup" aria-label="Tiles">
          {STYLES.map((s, i) => (
            <button
              type="button"
              key={s.id}
              role="radio"
              aria-checked={active === i}
              aria-label={s.label}
              className={`lm-chip ${active === i ? "on" : ""}`}
              onClick={(e) => {
                // The change ripples out from the chip.
                const r = e.currentTarget.getBoundingClientRect();
                setStyle(i, {
                  kind: "point",
                  x: (r.left + r.width / 2) / window.innerWidth,
                  y: 1 - (r.top + r.height / 2) / window.innerHeight,
                });
              }}
            >
              <span
                className="lm-swatch"
                style={{ backgroundImage: `url(${pictures[i]})` }}
              />
            </button>
          ))}
        </div>
      </div>
    </Html>
  );
};
