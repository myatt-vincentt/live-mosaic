# Plan — Live Mosaic

The live camera picture rebuilt as a hand-laid tile mosaic, full screen, with four tile styles.

## Design

- Tiles: small, slightly irregular quads laid in rows that follow the picture's contours, with
  grout between them. The layout is re-laid a few times a second and glides between layouts, so it
  never flickers; each tile's colour is taken from the live picture every frame and matched to the
  style's stones.
- The face gets slightly smaller tiles so it stays readable.
- Trail: when the person moves, their tiles keep the old colours for a moment, sway a little after
  the movement and fade back. Strength follows speed; still means no trail. Only the person trails.
- Styles: Roman stone (matte, blues, whites, ochre, skin pinks), Delft blue (white and cobalt
  glaze), glass and gold (jewel glass, shimmering gold leaf), broken ceramic (large bright shards,
  wide white grout).
- Changing style: a sideways hand swipe (next / previous), a drag across the screen, or the glass
  chips; the new style ripples in tile by tile from where the change started.
- Hint: a ghost hand sweeping sideways, gone after the first change.

## How it works

- `pipeline.ts` + `shaders.ts`: the GPU passes (contour field, tile layout, colour matching,
  drawing, trail history).
- `Mosaic.tsx`: drives the passes each frame, the face size, the trail and the ripple.
- `state.ts`, `styles.ts`, `config.ts`: the active style, the four styles and the tuning.
- `sim/gate.ts`: the steadied person mask.
