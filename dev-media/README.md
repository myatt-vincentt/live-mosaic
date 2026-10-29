# dev-media

Optional dev-only preview media. Nothing here ships: only
`src/DevMediaSwitcher.tsx` reads this folder, and it is stripped from
production builds.

You don't need anything here. Without a webcam, `pnpm dev` starts on the SDK's
built-in "Person Looking" video and lists every SDK sample video and
image. In development the keys 1–4 pick a style and [ / ] change the tile size
(see `src/mosaic/DevKeys.tsx`).

To preview with your own clip, add it at `dev-media/mosaic.mp4` (H.264 MP4); it
is listed first and used as the start. Clips here are git-ignored. Restart
`pnpm dev` after adding or removing one.
