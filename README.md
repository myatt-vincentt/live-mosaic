# Live Mosaic

Your camera picture rebuilt live as a hand-laid mosaic. Thousands of small tiles run in rows along
every contour of the picture, around your face, your hands and the room, with thin grout between
them; each tile takes its stone from the picture under it, so as you move the colours ripple through
tiles that stay put. Tiles are a little smaller on your face so it stays readable. When you move,
your tiles leave a soft swaying trail that fades back into the mosaic; standing still, there is
none. Four tile styles: Roman stone, Delft blue, glass and gold, and broken ceramic. Swipe a hand
sideways (or drag across the screen, or tap a chip) and the new style pops in tile by tile. The
picture fills the whole screen.

- The mosaic, its layout along the picture's contours and the trail: `src/mosaic/Mosaic.tsx`,
  `pipeline.ts`, `shaders.ts`; tuning in `config.ts`, the styles in `styles.ts`.
- The person (for the trail and the smaller face tiles) is the portrait mask, steadied and trusted
  only around the tracked face, body and hands (`src/mosaic/sim/gate.ts`).
- Changing style: `HandSwipe.tsx` (air swipe), `TouchSwipe.tsx` (drag), `Chips.tsx` (glass chips);
  the hint is a ghost hand sweeping sideways (`Hint.tsx`).
- `src/App.tsx` uses a full-window container instead of the 9:16 frame; re-apply after a template
  upgrade.
- Dev preview without a camera: the media switcher starts on the SDK's sample video. Dev keys: 1–4
  pick a style, `[` / `]` change the tile size, `d` cycles debug views.

---

# v2-template

The Vincentt starter app: a real React + R3F + Vincentt XR SDK (`@vincentt-xr/sdk`)
WebXR app, bundled by esbuild.

## Shape

```
src/
  main.tsx            mount — never edited
  App.tsx             protected shell: XRProvider + AspectRatioContainer +
                      XRScene + media-source binding, camera, lighting,
                      VideoBackground, PreviewAnchors — never edited
  Scene.tsx           the agent's surface: add SDK components and R3F
                      primitives here
  PreviewAnchors.tsx  editor-preview integration — never edited
```

See `AGENTS.md` and `GROUNDING.md` for the API reference and how to author scenes.

## Develop

```
pnpm install
pnpm dev          # esbuild dev server on localhost:5173 (output in .dev/)
pnpm preview      # on-device preview over a secure tunnel (needs `vincentt login`)
pnpm typecheck
pnpm build        # production bundle to dist/
```

## Release

`vincentt init` scaffolds from the **`latest` tag**, not from `main`. Merging to `main` does
not ship a template to creators — cutting a release does.

```
git tag 1.1.0 <sha>      # bare semver, no `v` prefix
git push origin 1.1.0    # the Release workflow verifies the tag, then moves `latest`
```

The Release workflow (`.github/workflows/release.yml`) installs from the frozen lockfile,
builds, and typechecks **the tagged tree** before force-updating `latest` to it. A tag that
fails leaves `latest` where it was, so a broken release cannot reach a new creator.

The job runs in the `release` environment, which accepts bare-semver tags only. To re-run it by
hand, dispatch it from the tag itself ("Use workflow from: 1.1.0"); a dispatch from `main` is
refused.

**Never move `latest` by hand.** It is force-updated by that workflow and nowhere else; moving
it manually decouples the pointer from the version it claims to be.

Creators can pin a specific version — `vincentt init --template 1.0.0` — which is the escape
hatch when a release turns out to be bad. That is why the version tags are immutable and only
`latest` moves.

### `MIGRATION.md` and the platform release row

Root `MIGRATION.md` carries one entry per released tag, newest first, authored in the same
PR as the change: `required: true|false`, a one-line summary, and optional notes bullets.
`required: false` means no consumer action is needed, never that the entry was skipped. The
Release workflow refuses to move `latest` for a tag with no valid entry, then — once `latest`
has moved — posts that entry as this release's row to the platform (`POST
/platform/releases`, component `template`), via `scripts/release-row.mjs`. Both steps read
`MIGRATION.md` from `main`, not from the tagged tree: the note is reviewed via PR into `main`
and is append-only per version, so `main`'s copy is the reviewed source for any tag, including
one cut before this file existed. That row is what `vincentt outdated` reads back to tell a
creator's agent what changed and what to do about it.
