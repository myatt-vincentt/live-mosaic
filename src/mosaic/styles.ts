// The four tile styles. Each one has its own stones (a small palette the
// picture is matched to), tile shape, grout and finish. Colours are sRGB hex;
// the shaders get them as OKLab (for matching) and linear RGB (for drawing).

export type StyleId = "roman" | "delft" | "smalti" | "trencadis";

export type MosaicStyle = {
  id: StyleId;
  /** What the chip says to a screen reader (the chips show no text). */
  label: string;
  /** The stones. */
  palette: string[];
  /**
   * Gold leaf: the palette's last `gold` entries are gold, laid wherever the
   * picture is brighter than `goldFrom` (OKLab lightness). 0 = no gold.
   */
  gold: number;
  goldFrom: number;
  /** Tile size against the base tile size. */
  scale: number;
  /** Tile length along its row ÷ its height. */
  aspect: number;
  /** 0 = tiles laid in rows (oriented quads), 1 = free shards (cut glazes). */
  shards: number;
  /** How strongly the rows follow the picture's contours (0..1). */
  flow: number;
  /** Random shift (share of a tile) and turn (radians) of each tile. */
  jitter: number;
  turn: number;
  /** Random size difference between tiles (share). */
  sizeJitter: number;
  /** How wobbly the tile edges are (share of a tile). */
  wobble: number;
  /** Grout width (share of a tile) and colour. */
  grout: number;
  groutColor: string;
  /** Picture grade before matching: contrast, saturation, lightness shift. */
  contrast: number;
  saturation: number;
  lift: number;
  /** How much colour (vs lightness) counts when matching a stone. */
  chroma: number;
  /** Finish: stone grain, gloss, shininess, sparkle, see-through glass. */
  grain: number;
  gloss: number;
  shine: number;
  sparkle: number;
  glass: number;
  /** Bevel width (share of a tile) and per-tile tilt (for glints). */
  bevel: number;
  tilt: number;
};

export const STYLES: MosaicStyle[] = [
  {
    // Matte natural stone and marble, light grout.
    id: "roman",
    label: "Roman stone",
    palette: [
      "#1d1a1c", // near-black
      "#2c3854", // slate
      "#36558f", // deep blue
      "#5f80bd", // blue
      "#9db4dc", // light blue
      "#ebe7de", // white marble
      "#d8c6a3", // cream
      "#c4954c", // ochre
      "#b0553a", // terracotta
      "#83372b", // rust
      "#d48c7c", // skin pink
      "#e6b3a0", // light pink
      "#5a392d", // brown
      "#8a8178", // warm grey
    ],
    gold: 0,
    goldFrom: 2,
    scale: 1,
    aspect: 1.2,
    shards: 0,
    flow: 1,
    jitter: 0.14,
    turn: 0.12,
    sizeJitter: 0.14,
    wobble: 0.07,
    grout: 0.15,
    groutColor: "#cfc7b6",
    contrast: 1.12,
    saturation: 1.4,
    lift: 0,
    chroma: 1.7,
    grain: 1,
    gloss: 0.05,
    shine: 12,
    sparkle: 0,
    glass: 0,
    bevel: 0.22,
    tilt: 0.12,
  },
  {
    // White and cobalt glazed ceramic, square-ish, glossy, white grout.
    id: "delft",
    label: "Delft blue",
    palette: [
      "#f6f4ec",
      "#e3e7ef",
      "#c2cfe6",
      "#8aa2cf",
      "#5476b8",
      "#2e529f",
      "#1c3a82",
      "#13275b",
      "#0b1532",
    ],
    gold: 0,
    goldFrom: 2,
    scale: 1.4,
    aspect: 1,
    shards: 0,
    flow: 0.75,
    jitter: 0.06,
    turn: 0.05,
    sizeJitter: 0.06,
    wobble: 0.03,
    grout: 0.12,
    groutColor: "#f2f0e8",
    contrast: 1.4,
    saturation: 1,
    lift: -0.1,
    chroma: 0.25,
    grain: 0.2,
    gloss: 0.9,
    shine: 70,
    sparkle: 0,
    glass: 0,
    bevel: 0.26,
    tilt: 0.06,
  },
  {
    // Jewel-coloured glass with gold leaf in the brightest places, dark grout.
    id: "smalti",
    label: "Glass and gold",
    palette: [
      "#0f1a4a", // lapis
      "#1f4fb3", // cobalt
      "#108a8c", // teal
      "#1d7a3e", // emerald
      "#6c2070", // amethyst
      "#b0153c", // ruby
      "#e2582e", // orange
      "#f0ae36", // amber
      "#d99a95", // rose
      "#0e0e12", // black glass
      "#7a4a2a", // umber
      "#6b7a2a", // olive
      "#d8a845", // gold
      "#f5d985", // pale gold
    ],
    gold: 2,
    goldFrom: 0.8,
    scale: 1.1,
    aspect: 1.25,
    shards: 0,
    flow: 1,
    jitter: 0.16,
    turn: 0.16,
    sizeJitter: 0.16,
    wobble: 0.06,
    grout: 0.17,
    groutColor: "#1b1814",
    contrast: 1.15,
    saturation: 1.55,
    lift: 0,
    chroma: 1.2,
    grain: 0.25,
    gloss: 0.7,
    shine: 40,
    sparkle: 1,
    glass: 0.35,
    bevel: 0.2,
    tilt: 0.3,
  },
  {
    // Broken glazed tiles (trencadís): big angular shards, wide white grout.
    id: "trencadis",
    label: "Broken tiles",
    palette: [
      "#f6f2e7", // white
      "#1b4fa0", // cobalt
      "#39b0c8", // turquoise
      "#f2c12e", // yellow
      "#e8772a", // orange
      "#c8312c", // red
      "#3f8f3e", // green
      "#9cc55a", // light green
      "#1c1c1f", // black
      "#f0a0b2", // pink
      "#6a3d8f", // purple
      "#8a5a3c", // brown
    ],
    gold: 0,
    goldFrom: 2,
    scale: 1.9,
    aspect: 1,
    shards: 1,
    flow: 0,
    jitter: 0.42,
    turn: 3.14,
    sizeJitter: 0.1,
    wobble: 0.02,
    grout: 0.2,
    groutColor: "#ebe7dc",
    contrast: 1.2,
    saturation: 1.6,
    lift: 0,
    chroma: 1.3,
    grain: 0.15,
    gloss: 0.8,
    shine: 55,
    sparkle: 0,
    glass: 0,
    bevel: 0.14,
    tilt: 0.22,
  },
];

export const STYLE_COUNT = STYLES.length;
export const MAX_PALETTE = 16;

/** sRGB hex → linear RGB. */
export const hexToLinear = (hex: string): [number, number, number] => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16))
    .map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
  return [c[0], c[1], c[2]];
};

/** Linear RGB → OKLab (Björn Ottosson's published matrices). */
export const linearToOklab = ([r, g, b]: [number, number, number]): [
  number,
  number,
  number,
] => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
