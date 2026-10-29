// Tuning for the mosaic, in one place.

export const TILES = {
  /** Default tile size, as a share of the screen height (before the style's own scale). */
  size: 1 / 92,
  /** Grid cells kept beyond each screen edge (the face magnifier pushes tiles out). */
  margin: 3,
};

export const LAYOUT = {
  /** New layouts per second, at most. */
  rate: 2.5,
  /** Seconds the tiles take to glide to a new layout (about the time to the next one). */
  glide: 0.3,
  /** A tile stays put unless it would move this far (cells) or turn this much (radians). */
  keepShift: 0.2,
  keepTurn: 0.16,
  /** Height of the picture the layout reads (pixels). */
  analysis: 288,
  /** How strong an edge must be for tile rows to follow it. */
  edge: 0.03,
  /**
   * How much of a new distance field is taken at each layout: around you,
   * and away from you (so the background rows hold still while you move).
   */
  followNear: 0.4,
  followFar: 0.12,
  /** Colour counts this much (vs lightness) when finding edges. */
  edgeChroma: 0.8,
};

export const FACE = {
  /** Tiles on the face are this much smaller than elsewhere (1 = same). */
  detail: 0.72,
  /** How far the smaller tiles reach, against the face's size. */
  reach: 0.62,
  /** Face tracking rate (it only steers the tile size and the light). */
  fps: 12,
};

export const RIPPLE = {
  /** Seconds for the change to cross the screen, plus each tile's own pop. */
  travel: 0.55,
  pop: 0.25,
};

export const RENDER = {
  /** The mosaic is drawn at up to this many pixels per CSS pixel … */
  maxScale: 2,
  /** … and at most this many pixels in all (phones). */
  maxPixels: 2_400_000,
};

export const TRAIL = {
  /** Motion speed (screen heights / s) where the trail starts, and where it is full. */
  from: 0.16,
  full: 0.6,
  /** How fast the trail comes in, and fades away after you stop (per second). */
  rise: 6,
  fall: 1.5,
  /** How long the trail lasts (s): a small move, a big one. */
  shortest: 0.4,
  longest: 0.8,
  /** The trail drifts after you at this share of your speed … */
  follow: 0.3,
  /** … swaying across by up to this (screen heights / s), this often (rad / s). */
  sway: 0.06,
  swayRate: 2.4,
  /** A hand's speed counts this much (hands are quick). */
  handWeight: 0.6,
  /** The person mask's size (share of the screen, at most this tall) and how fast it follows (per s). */
  scale: 0.35,
  maxHeight: 360,
  maskRate: 16,
};
