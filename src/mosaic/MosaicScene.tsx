// Live Mosaic: the whole camera picture rebuilt, live, as a hand-laid
// mosaic. Thousands of small tiles run in rows along every contour, each
// taking its stone from the picture under it, so as you move the colours
// ripple through tiles that stay put. Four tile styles; swipe a hand
// sideways (or the screen, or tap a chip) to change, and the new style pops
// in tile by tile across the mosaic.
//
//   renderOrder -998  the mosaic (Mosaic.tsx, over the camera picture)
//   renderOrder 40    hint — the ghost hand (Hint.tsx)
//   DOM               the style chips (Chips.tsx)
import { Chips } from "./Chips";
import { HandSwipe } from "./HandSwipe";
import { Hint } from "./Hint";
import { Mosaic } from "./Mosaic";
import { TouchSwipe } from "./TouchSwipe";

export const MosaicScene = () => (
  <>
    <Mosaic />
    <HandSwipe />
    <TouchSwipe />
    <Hint />
    <Chips />
  </>
);
