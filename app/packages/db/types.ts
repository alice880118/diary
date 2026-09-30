export const SCHEMA_VERSION = 1;

export const PAGE_W = 900;
export const PAGE_H = 1200;

export const ART_W = 1024;
export const ART_H = 1024;

export type PageStyle = "lined" | "blank" | "dot" | "grid" | "dated";

export type BrushKind = "pen" | "marker" | "pencil";

export interface Stroke {
  id: string;
  mode: "draw" | "erase";
  brush: BrushKind;
  color: string;
  width: number;
  opacity: number;
  /** Flat list: x0, y0, x1, y1, ... in the owning surface coordinates. */
  points: number[];
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
}

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
}

export interface LinkMeta {
  status: "loading" | "ok" | "fail";
  siteTitle?: string;
  description?: string;
  image?: string;
  fetchedAt?: number;
}

export interface LinkObject extends ObjectBase {
  type: "link";
  url: string;
  title: string;
  display: "text" | "card";
  meta: LinkMeta | null;
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

export interface MonthlyOverview {
  /** `${notebookId}:${YYYY-MM}` */
  key: string;
  notebookId: string;
  ym: string;
  highlight: string | null;
  sticker: StickerSnap | null;
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
  texture: { id: string; strength: number };
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
}
