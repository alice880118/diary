/**
 * Bumped when records can carry fields an older app would render wrongly.
 * v2: note tape pattern/color, link sticker/tag display, paper texture scale.
 * All v2 fields are optional; readers fall back to the v1 look when absent.
 * v3: textured brushes, per-point pressure, editable shapes on strokes.
 * Older apps draw unknown brushes as a pen and shapes from their outline points.
 */
export const SCHEMA_VERSION = 3;

export const PAGE_W = 900;
export const PAGE_H = 1200;

export const ART_W = 1024;
export const ART_H = 1024;

export type PageStyle = "lined" | "blank" | "dot" | "grid" | "dated";

export type BrushKind = "pen" | "marker" | "pencil" | "crayon" | "chalk" | "pastel" | "dryBrush";

export type ShapeType =
  | "rect"
  | "roundRect"
  | "circle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "line"
  | "arrow"
  | "arc";

/**
 * Editable geometry, in the owning surface coordinates. Every shape is a box
 * (center, size, rotation in degrees); a line/arrow runs along the box's
 * horizontal center line, an arc is a slice of the box's ellipse.
 */
export interface ShapeGeom {
  type: ShapeType;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  /** Arc only: start angle and signed sweep, radians, in the unrotated box frame. */
  start?: number;
  sweep?: number;
}

/** Room for texture / pattern / riso fills later without changing the shape. */
export type FillStyle = { kind: "none" } | { kind: "solid"; color: string };

export interface Stroke {
  id: string;
  mode: "draw" | "erase";
  brush: BrushKind;
  color: string;
  width: number;
  opacity: number;
  /**
   * Flat list: x0, y0, x1, y1, ... in the owning surface coordinates.
   * For shapes this is a sampled outline, kept so older app versions can
   * still draw them; the shape itself is the source of truth.
   */
  points: number[];
  /** Texture seed; absent on older strokes (derived from id). */
  seed?: number;
  /** Per-point pressure 0..1 (same count as points/2); absent = constant. */
  pressure?: number[];
  /** Texture strength 0..1 for textured brushes; absent = brush default. */
  texture?: number;
  /** Present when this stroke is an editable shape (drawn or recognized). */
  shape?: ShapeGeom;
  fill?: FillStyle;
  /** Shape outline on/off; absent = on. */
  outline?: boolean;
}

export interface Notebook {
  id: string;
  name: string;
  cover: string;
  defaultStyle: PageStyle;
  order: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type StickerMaterial = "clear" | "holo" | "white";

/** Immutable reference to a rendered sticker version. */
export interface StickerSnap {
  stickerId: string;
  version: number;
  name: string;
  artAssetId: string;
  shapeAssetId: string;
  material: StickerMaterial;
  w: number;
  h: number;
  holoAngle: number;
}

interface ObjectBase {
  id: string;
  /** Center position in page coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rot: number;
  z: number;
  locked: boolean;
}

export interface TextObject extends ObjectBase {
  type: "text";
  text: string;
  font: string;
  size: number;
  color: string;
  align: "left" | "center" | "right";
  /** Font weight; absent = 400 (regular). */
  weight?: TextWeight;
  /** Box hugs the text width (new texts); absent = fixed width as stored. */
  autoW?: boolean;
}

export type TextWeight = 400 | 500 | 600 | 700;

export interface ImageObject extends ObjectBase {
  type: "image";
  assetId: string;
}

export interface StickerObject extends ObjectBase {
  type: "sticker";
  snap: StickerSnap;
}

export type NoteFix = "tape" | "pin" | "top";
export type NoteShape = "square" | "rounded" | "torn" | "cloud";

export type TapePattern =
  | "solid"
  | "stripe"
  | "diagonal"
  | "dots"
  | "gingham"
  | "grid"
  | "wave"
  | "stars"
  | "hearts"
  | "floral";

export const NOTE_BASE = 300;

export interface NoteObject extends ObjectBase {
  type: "note";
  color: string;
  shape: NoteShape;
  text: string;
  textSize: number;
  /** Strokes in note base coordinates (NOTE_BASE x NOTE_BASE). */
  strokes: Stroke[];
  fix: NoteFix;
  /** Anchor in normalized note coordinates (0..1). */
  anchor: { x: number; y: number };
  /** Sway strength 0..1 for the free edge. */
  sway: number;
  /** Tape look when fix is "tape". Absent = the original peach diagonal tape. */
  tapePattern?: TapePattern;
  tapeColor?: string;
}

export interface LinkMeta {
  status: "loading" | "ok" | "fail";
  siteTitle?: string;
  description?: string;
  image?: string;
  fetchedAt?: number;
}

/** "card" / "text" are the v1 looks and stay valid for existing links. */
export type LinkDisplay = "card" | "text" | "sticker" | "tag";
export type LinkShape = "circle" | "square" | "triangle" | "hexagon" | "star";

export interface LinkObject extends ObjectBase {
  type: "link";
  url: string;
  title: string;
  display: LinkDisplay;
  meta: LinkMeta | null;
  /** Sticker display only; absent = circle / default color. */
  shape?: LinkShape;
  color?: string;
}

export type PageObject =
  | TextObject
  | ImageObject
  | StickerObject
  | NoteObject
  | LinkObject;

export interface Page {
  id: string;
  notebookId: string;
  /** Local calendar date YYYY-MM-DD. */
  date: string;
  order: number;
  style: PageStyle;
  coord: { w: number; h: number };
  objects: PageObject[];
  ink: Stroke[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface MonthGoal {
  id: string;
  /** Up to 30 characters; blank goals aren't stored. */
  text: string;
  done: boolean;
  order: number;
  /** Month it was carried over from ("YYYY-MM"), for "from Sep". */
  carriedFrom?: string | null;
  /** Month it was carried on to; it no longer counts as unfinished here. */
  movedTo?: string | null;
}

export type CoverShape = NoteShape | "polaroid";
export type CoverFix = "tape" | "pin" | "none";

/** Month cover look; absent = polaroid, cream photo area, pink stripe tape. */
export interface MonthCover {
  paper: string;
  shape: CoverShape;
  fix: CoverFix;
  tapePattern: TapePattern;
  tapeColor: string;
}

export interface MonthlyOverview {
  /** `${notebookId}:${YYYY-MM}` */
  key: string;
  notebookId: string;
  ym: string;
  highlight: string | null;
  sticker: StickerSnap | null;
  /** Optional (added with the calendar redesign); absent = no goals. */
  goals?: MonthGoal[];
  /** Optional; absent = default cover. */
  cover?: MonthCover;
  /** Set once unfinished goals from the previous month were carried in. */
  carried?: boolean;
  updatedAt: number;
}

export interface DrawLayer {
  id: string;
  name: string;
  visible: boolean;
  kind: "draw";
  strokes: Stroke[];
}

export interface ImageLayer {
  id: string;
  name: string;
  visible: boolean;
  kind: "image";
  /** Untouched original file. */
  originalAssetId: string;
  /** Downscaled working copy used for editing and rendering. */
  workAssetId: string;
  /** Background removal / correction mask at working size, null = none. */
  maskAssetId: string | null;
  imgW: number;
  imgH: number;
  /** Center in artwork coordinates. */
  x: number;
  y: number;
  scale: number;
  rot: number;
  /** Crop insets as fraction of working image (0..0.49). */
  crop: { l: number; t: number; r: number; b: number };
}

export type ArtLayer = DrawLayer | ImageLayer;

export interface PrintLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  maskAssetId: string | null;
  density: number;
  grain: number;
  unevenness: number;
  paperShow: number;
  seed: number;
  /** Misregistration offset in artwork units. */
  offset: { dx: number; dy: number };
  /**
   * Editable brush strokes and shapes painted for this ink, drawn over the
   * raster mask in order (eraser strokes cut both). Absent on older inks.
   */
  strokes?: Stroke[];
}

export type CropKind = "rect" | "circle" | "contour" | "manual";

export interface StickerSettings {
  material: StickerMaterial;
  crop: {
    kind: CropKind;
    /** Artwork coordinates for rect / circle bounds. */
    rect: { x: number; y: number; w: number; h: number };
    /** Flat polygon points for manual crop. */
    poly: number[];
  };
  border: number;
  keepPaper: boolean;
  holoAngle: number;
}

export interface Artwork {
  id: string;
  name: string;
  w: number;
  h: number;
  layers: ArtLayer[];
  /** scale: texture size multiplier (1 = 100%); absent on v1 artworks = 1. */
  texture: { id: string; strength: number; scale?: number };
  print: { enabled: boolean; layers: PrintLayer[] };
  sticker: StickerSettings;
  stickerId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface StickerVersion {
  no: number;
  artworkId: string;
  artworkSnapshot: Artwork;
  material: StickerMaterial;
  artAssetId: string;
  shapeAssetId: string;
  w: number;
  h: number;
  holoAngle: number;
  createdAt: number;
}

export interface Sticker {
  id: string;
  name: string;
  category: string;
  versions: StickerVersion[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type AssetRole =
  | "original"
  | "work"
  | "mask"
  | "art"
  | "shape"
  | "image"
  | "thumb";

export interface Asset {
  id: string;
  mime: string;
  blob: Blob;
  w: number;
  h: number;
  hash: string;
  role: AssetRole;
  name: string;
  /** Shown in the imported image library. */
  library: boolean;
  createdAt: number;
  deletedAt: number | null;
}

export type MotionPref = "system" | "reduce" | "full";

export interface AppSettings {
  key: "app";
  schemaVersion: number;
  motion: MotionPref;
  onboarded: boolean;
  lastBackupAt: number | null;
  /** First day of the week in the month calendar: 1 = Monday (default), 0 = Sunday. */
  weekStart?: 0 | 1;
  /** Background color of the diary screens (bookshelf, year, month); absent = journal cream. */
  diaryBg?: string;
}

/* ------------------------------------------------------------------ */
/* Home board                                                          */
/* ------------------------------------------------------------------ */

/** Board surface in units; matches the Figma "IG / home" artboard (402 x 874). */
export const BOARD_W = 402;
export const BOARD_H = 874;

export type BoardTexture = "smooth" | "grain" | "paper";

export interface BoardItem {
  id: string;
  /** "doodle" = a drawing made on the board (optional, added later). */
  source: "preset" | "sticker" | "doodle";
  /** Built-in sticker id when source is "preset". */
  presetId?: string;
  /** Doodle strokes in their own box (dw x dh board units) when source is "doodle". */
  strokes?: Stroke[];
  dw?: number;
  dh?: number;
  /** Rendered sticker version when source is "sticker" (library deletes don't affect it). */
  snap?: StickerSnap;
  /** Center and width as fractions of the board width (0..1). */
  x: number;
  y: number;
  w: number;
  /** Degrees, clockwise. */
  rot: number;
  z: number;
}

/**
 * Stored in the settings store under key "home". Absent until the first
 * edit; readers fill the default board.
 */
/** A user-picked fill: one color or a two-stop linear gradient (angle in CSS degrees). */
export type ColorFill = { kind: "solid"; color: string } | { kind: "gradient"; from: string; to: string; angle: number };

export interface HomeBoard {
  key: "home";
  /** `color` is a preset id, or "custom" to use `custom` (optional, added later). */
  background: { color: string; texture: BoardTexture; shapes: boolean; custom?: ColorFill };
  items: BoardItem[];
  /** Doodles in board units (BOARD_W wide), drawn beneath the stickers. */
  strokes: Stroke[];
  updatedAt: number;
}
