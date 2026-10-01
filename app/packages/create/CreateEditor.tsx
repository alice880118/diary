import { useNavigate } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { imageLayerFromFile } from "../art/create";
import {
  contentCanvas,
  renderDraft,
  renderFinal,
  renderSingleInk,
  renderSource,
  usesPrint,
} from "../art/render";
import { createCanvas, ctx2d, loadRuntime, maskHasContent, persistMask, type ArtRuntime } from "../art/runtime";
import { useArtworkDoc } from "../art/useArtworkDoc";
import { ImportError, pickFile } from "../assets/importImage";
import { useLive } from "../db/events";
import { newId } from "../db/id";
import { describeError } from "../db/idb";
import { listStickers } from "../db/repo";
import {
  ART_H,
  ART_W,
  type ArtLayer,
  type Artwork,
  type ImageLayer,
  type PrintLayer,
  type StickerSettings,
  type Sticker,
  type StickerVersion,
} from "../db/types";
import type { PenState } from "../drawing/PenPanel";
import type { SaveStatus } from "../editor/useEditorDoc";
import { MAX_PRINT_LAYERS, newPrintLayer } from "../print/layers";
import { Dropdown } from "../shell/Dropdown";
import { Icon } from "../shell/Icon";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";
import { useElementSize } from "../shell/useSize";
import { buildSticker, cropBaseShape } from "../sticker/build";
import { PlacementSheet } from "../sticker/PlacementSheet";
import { finishSticker } from "../sticker/save";
import { ArtCanvas, type ArtTool } from "./ArtCanvas";
import { BgRemoveSheet } from "./BgRemoveSheet";
import { FinishSheet } from "./FinishSheet";
import {
  BrushPopover,
  ColorButton,
  ImageAdjustPopover,
  LabeledTool,
  LayersSheet,
  PalettePopover,
  SKETCH_COLORS,
  SKETCH_TOOLS,
  StepPill,
  StudioBar,
  ToolButton,
  useSketchBrushes,
  type SketchTool,
} from "./SketchTools";
import { StickerPreview } from "./StickerPreview";
import {
  CutPopover,
  InkColorPopover,
  InksSheet,
  inkLabel,
  MASK_TOOLS,
  MaskSizePopover,
  MaterialPopover,
  PAPER_STRIP_H,
  PaperSheet,
  PaperStrip,
  PRINT_VIEWS,
  PrintParamsSheet,
  TexturePopover,
  type MaskTool,
  type PrintView,
} from "./StudioSteps";
import { textureById } from "../textures/catalog";
import "./create.css";

type Step = "draw" | "paper" | "print" | "sticker";

const STEPS: { id: Step; label: string }[] = [
  { id: "draw", label: "Sketch" },
  { id: "paper", label: "Paper" },
  { id: "print", label: "Print" },
  { id: "sticker", label: "Sticker" },
];

const STATUS: Record<SaveStatus, string> = {
  saved: "Saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
};

/** Bottom toolbar height + gap, where L2 popovers sit. */
const POP_BOTTOM = 88;

function assetSignature(art: Artwork) {
  return [
    ...art.layers.map((l) => (l.kind === "image" ? `${l.id}:${l.workAssetId}:${l.maskAssetId}` : l.id)),
    ...art.print.layers.map((p) => `${p.id}:${p.maskAssetId}`),
  ].join("|");
}

function withReturn(returnTo: string, stickerId: string) {
  const [path, query = ""] = returnTo.split("?");
  const q = new URLSearchParams(query);
  q.set("addSticker", stickerId);
  return `${path}?${q.toString()}`;
}

export function CreateEditor({
  initial,
  returnTo,
  removeBgLayer,
}: {
  initial: Artwork;
  returnTo: string | null;
  removeBgLayer: string | null;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const doc = useArtworkDoc(initial);
  const { art, commit } = doc;
  const [rt, setRt] = useState<ArtRuntime | null>(null);
  const [rtTick, setRtTick] = useState(0);
  const rtRef = useRef<ArtRuntime | null>(null);
  const [step, setStep] = useState<Step>("draw");
  const [activeLayer, setActiveLayer] = useState<string | null>(
    initial.layers[initial.layers.length - 1]?.id ?? null,
  );
  const [activePrint, setActivePrint] = useState<string | null>(initial.print.layers[0]?.id ?? null);
  const [sketchTool, setSketchTool] = useState<SketchTool>("pen");
  const [color, setColor] = useState(SKETCH_COLORS[0]);
  const [brushes, setBrush] = useSketchBrushes();
  const [shine, setShine] = useState(false);
  const [pop, setPop] = useState<
    "brush" | "palette" | "image" | "texture" | "maskSize" | "inkColor" | "material" | "cut" | null
  >(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const [inksOpen, setInksOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef<HTMLButtonElement>(null);
  const texAdjustRef = useRef<HTMLButtonElement>(null);
  const inkColorRef = useRef<HTMLButtonElement>(null);
  const stickerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  /** Sticker canvas: the cut editor while the Cut popover edits a box or lasso, else the preview. */
  const preview: "static" | "shine" | "crop" =
    step === "sticker" && pop === "cut" && art.sticker.crop.kind !== "contour" ? "crop" : shine ? "shine" : "static";
  const cropDrag = useRef<{ mode: "move" | "resize"; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  const toolRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const colorRef = useRef<HTMLButtonElement>(null);
  const adjustRef = useRef<HTMLButtonElement>(null);
  const [maskTool, setMaskTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(48);
  const [printView, setPrintView] = useState<PrintView>("composite");
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [built, setBuilt] = useState<{ art: string; shape: string; w: number; h: number } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [bgLayer, setBgLayer] = useState<string | null>(removeBgLayer);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<{ sticker: Sticker; version: StickerVersion } | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const session = useRef(false);
  const imgDragOrigin = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);
  const stickers = useLive(listStickers, []);

  /* ---------- runtime (decoded assets) ---------- */

  const sig = assetSignature(art);
  useEffect(() => {
    let alive = true;
    loadRuntime(art, rtRef.current ?? undefined)
      .then((r) => {
        if (!alive) return;
        rtRef.current = r;
        setRt(r);
        setRtTick((t) => t + 1);
        if (r.missing.size) toast("Some assets are missing and were replaced with blanks", "error");
      })
      .catch((err) => toast(describeError(err), "error"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  /* ---------- commit helpers ---------- */

  /** Continuous controls record one undo step at the start of a drag. */
  const change = useCallback(
    (fn: (a: Artwork) => Artwork, mode: "discrete" | "continuous" | "end" = "discrete") => {
      if (mode === "continuous") {
        commit(fn, !session.current);
        session.current = true;
      } else if (mode === "end") {
        commit(fn, !session.current);
        session.current = false;
      } else {
        session.current = false;
        commit(fn, true);
      }
    },
    [commit],
  );

  const setLayer = (id: string, patch: Partial<ArtLayer>, mode: "discrete" | "continuous" | "end" = "discrete") =>
    change((a) => ({ ...a, layers: a.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as ArtLayer) : l)) }), mode);

  const setPrintLayer = (p: PrintLayer, record?: boolean) =>
    change(
      (a) => ({ ...a, print: { ...a.print, layers: a.print.layers.map((l) => (l.id === p.id ? p : l)) } }),
      record === false ? "continuous" : record === true ? "end" : "discrete",
    );

  const setSticker = (s: StickerSettings, continuous?: boolean) =>
    change((a) => ({ ...a, sticker: s }), continuous ? "continuous" : session.current ? "end" : "discrete");

  /* ---------- derived ---------- */

  const layer = art.layers.find((l) => l.id === activeLayer) ?? null;
  const pLayer = art.print.layers.find((l) => l.id === activePrint) ?? null;
  const emptyMasks = useMemo(() => {
    const s = new Set<string>();
    if (!rt) return s;
    for (const p of art.print.layers) if (!maskHasContent(rt.printMasks.get(p.id))) s.add(p.id);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, rtTick, art.print.layers]);

  /* ---------- base render ---------- */

  useEffect(() => {
    if (!rt) return;
    let alive = true;
    const t = setTimeout(() => {
      if (!alive) return;
      try {
        let c: HTMLCanvasElement;
        if (step === "draw") {
          c = renderDraft(art, rt);
        } else if (step === "paper") {
          c = usesPrint(art, rt) ? renderFinal(art, rt, 1, { keepPaper: true }) : renderDraft(art, rt);
        } else if (step === "print") {
          if (printView === "draft") c = renderDraft(art, rt);
          else if (printView === "single" && pLayer) c = renderSingleInk(art, rt, pLayer.id);
          else if (printView === "mask") {
            c = createCanvas(ART_W, ART_H);
            const ctx = ctx2d(c);
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, ART_W, ART_H);
          } else c = usesPrint(art, rt) ? renderFinal(art, rt, 1, { keepPaper: true }) : renderDraft(art, rt);
        } else {
          c = renderFinal(art, rt, 1, { keepPaper: art.sticker.keepPaper });
        }
        setBase(c);
      } catch (err) {
        toast(describeError(err), "error");
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, rt, rtTick, step, printView, activePrint]);

  /* ---------- sticker build preview ---------- */

  useEffect(() => {
    if (!rt || step !== "sticker") return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const b = buildSticker(art, rt, 0.5);
        const [artBlob, shapeBlob] = await Promise.all([
          new Promise<Blob | null>((r) => b.art.toBlob(r)),
          new Promise<Blob | null>((r) => b.shape.toBlob(r)),
        ]);
        if (!alive || !artBlob || !shapeBlob) return;
        setBuilt((old) => {
          if (old) {
            URL.revokeObjectURL(old.art);
            URL.revokeObjectURL(old.shape);
          }
          return { art: URL.createObjectURL(artBlob), shape: URL.createObjectURL(shapeBlob), w: b.w, h: b.h };
        });
        setBuildError(null);
      } catch (err) {
        if (alive) setBuildError(err instanceof Error ? err.message : String(err));
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [art, rt, rtTick, step]);

  /* ---------- actions ---------- */

  const addDrawLayer = () => {
    const l: ArtLayer = {
      id: newId("ly"),
      name: `Sketch ${art.layers.filter((x) => x.kind === "draw").length + 1}`,
      visible: true,
      kind: "draw",
      strokes: [],
    };
    change((a) => ({ ...a, layers: [...a.layers, l] }));
    setActiveLayer(l.id);
  };

  const addImageLayer = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const l = await imageLayerFromFile(file, art.layers.filter((x) => x.kind === "image").length + 1);
      change((a) => ({ ...a, layers: [...a.layers, l] }));
      setActiveLayer(l.id);
      setBgLayer(l.id);
    } catch (err) {
      toast(err instanceof ImportError ? err.message : describeError(err), "error");
    }
  };

  const reorderLayer = (id: string, to: number) =>
    change((a) => {
      const i = a.layers.findIndex((l) => l.id === id);
      if (i < 0 || to < 0 || to >= a.layers.length || i === to) return a;
      const layers = [...a.layers];
      const [l] = layers.splice(i, 1);
      layers.splice(to, 0, l);
      return { ...a, layers };
    });

  const duplicateLayer = (id: string) => {
    const src = art.layers.find((x) => x.id === id);
    if (!src) return;
    const copy = { ...structuredClone(src), id: newId("ly"), name: `${src.name} copy` } as ArtLayer;
    if (copy.kind === "draw") copy.strokes = copy.strokes.map((st) => ({ ...st, id: newId("st") }));
    change((a) => {
      const i = a.layers.findIndex((x) => x.id === id);
      const layers = [...a.layers];
      layers.splice(i + 1, 0, copy);
      return { ...a, layers };
    });
    setActiveLayer(copy.id);
  };

  const deleteLayer = (id: string) => {
    if (art.layers.length <= 1) return;
    change((a) => ({ ...a, layers: a.layers.filter((x) => x.id !== id) }));
    if (activeLayer === id) {
      const rest = art.layers.filter((x) => x.id !== id);
      setActiveLayer(rest[rest.length - 1]?.id ?? null);
    }
  };

  const commitMask = async (p: PrintLayer) => {
    const c = rtRef.current?.printMasks.get(p.id);
    if (!c) return;
    try {
      const id = await persistMask(c, p.name);
      change((a) => ({
        ...a,
        print: { ...a.print, layers: a.print.layers.map((l) => (l.id === p.id ? { ...l, maskAssetId: id } : l)) },
      }));
      setRtTick((t) => t + 1);
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  const lassoMask = (poly: number[], add: boolean) => {
    if (!pLayer) return;
    const c = rtRef.current?.printMasks.get(pLayer.id);
    if (!c) return;
    const ctx = ctx2d(c);
    ctx.save();
    ctx.globalCompositeOperation = add ? "source-over" : "destination-out";
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    void commitMask(pLayer);
  };

  const maskFromLayer = (inkId: string, artLayerId: string) => {
    const ink = art.print.layers.find((l) => l.id === inkId);
    if (!ink || !rt) return;
    setActivePrint(inkId);
    const c = rt.printMasks.get(ink.id);
    if (!c) return;
    const src = renderSource(art, rt, 1, artLayerId);
    const ctx = ctx2d(c);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(src, 0, 0);
    // Normalize colours to white so only coverage matters.
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ART_W, ART_H);
    ctx.globalCompositeOperation = "source-over";
    void commitMask(ink);
    toast("Area created from layer");
  };

  const clearMask = (inkId: string) => {
    const ink = art.print.layers.find((l) => l.id === inkId);
    if (!ink) return;
    const c = rtRef.current?.printMasks.get(ink.id);
    if (!c) return;
    ctx2d(c).clearRect(0, 0, ART_W, ART_H);
    void commitMask(ink);
  };

  const autoFitCrop = () => {
    if (!rt) return;
    const c = contentCanvas(art, rt, 0.25);
    const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
    let minX = c.width;
    let minY = c.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > 20) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
    if (maxX < 0) {
      toast("The canvas is still empty", "error");
      return;
    }
    const m = 24;
    setSticker({
      ...art.sticker,
      crop: {
        ...art.sticker.crop,
        rect: { x: minX * 4 - m, y: minY * 4 - m, w: (maxX - minX + 1) * 4 + m * 2, h: (maxY - minY + 1) * 4 + m * 2 },
      },
    });
  };

  const leave = async () => {
    await doc.flush();
    navigate(returnTo ?? "/create");
  };

  /* ---------- canvas tool & overlay ---------- */

  const pen: PenState = { tool: sketchTool, color, ...brushes[sketchTool] };

  let tool: ArtTool = { kind: "none" };
  if (step === "draw" && layer) {
    tool = layer.kind === "draw" ? { kind: "draw", pen } : { kind: "moveImage" };
  } else if (step === "print" && pLayer && rt) {
    const c = rt.printMasks.get(pLayer.id);
    if (c && (maskTool === "brush" || maskTool === "erase")) {
      tool = { kind: "maskBrush", canvas: c, size: brushSize, erase: maskTool === "erase" };
    } else if (c) {
      tool = { kind: "lasso", purpose: maskTool === "lassoAdd" ? "maskAdd" : "maskSub" };
    }
  } else if (step === "sticker" && preview === "crop" && art.sticker.crop.kind === "manual") {
    tool = { kind: "lasso", purpose: "crop" };
  } else if (step === "sticker" && preview === "crop") {
    tool = { kind: "moveImage" };
  }
  if (step === "print" && !art.print.enabled) tool = { kind: "none" };

  const drawOverlay = (ctx: CanvasRenderingContext2D) => {
    if (step === "draw" && layer?.kind === "image") {
      const l = layer;
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate((l.rot * Math.PI) / 180);
      ctx.scale(l.scale, l.scale);
      ctx.setLineDash([12 / l.scale, 8 / l.scale]);
      ctx.lineWidth = 3 / l.scale;
      ctx.strokeStyle = "#1b1b1b";
      ctx.strokeRect(
        -l.imgW / 2 + l.crop.l * l.imgW,
        -l.imgH / 2 + l.crop.t * l.imgH,
        l.imgW * (1 - l.crop.l - l.crop.r),
        l.imgH * (1 - l.crop.t - l.crop.b),
      );
      ctx.restore();
    }
    if (step === "print" && pLayer && rt) {
      const m = rt.printMasks.get(pLayer.id);
      if (!m) return;
      const tint = createCanvas(ART_W, ART_H);
      const t = ctx2d(tint);
      t.drawImage(m, 0, 0);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = printView === "mask" ? "#2f2a25" : pLayer.color;
      t.fillRect(0, 0, ART_W, ART_H);
      ctx.globalAlpha = printView === "mask" ? 0.9 : 0.32;
      ctx.drawImage(tint, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (step === "sticker" && preview === "crop" && rt) {
      const shape = cropBaseShape(art, rt, 0.5);
      const t = ctx2d(shape);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = "#1b1b1b";
      t.fillRect(0, 0, shape.width, shape.height);
      ctx.globalAlpha = 0.16;
      ctx.drawImage(shape, 0, 0, ART_W, ART_H);
      ctx.globalAlpha = 1;
      const k = art.sticker.crop.kind;
      if (k === "rect" || k === "circle") {
        const r = art.sticker.crop.rect;
        ctx.save();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#1b1b1b";
        ctx.setLineDash([14, 10]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(r.x + r.w, r.y + r.h, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const overlayKey = `${step}|${activeLayer}|${activePrint}|${printView}|${preview}|${rtTick}|${JSON.stringify(
    step === "draw" && layer?.kind === "image" ? [layer.x, layer.y, layer.scale, layer.rot, layer.crop] : null,
  )}|${step === "sticker" ? JSON.stringify(art.sticker.crop) : ""}|${pLayer?.color}`;

  /* ---------- layout ---------- */

  const canvasSize = Math.max(200, Math.min(stage.width - 24, stage.height - 24));
  const imgLayer = layer?.kind === "image" ? (layer as ImageLayer) : null;
  const categories = Array.from(new Set((stickers.data ?? []).map((s) => s.category).filter(Boolean)));
  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const edited: Record<Step, boolean> = {
    draw: art.layers.some((l) => l.kind === "image" || l.strokes.length > 0),
    paper: art.texture.id !== "wc-fine" || art.texture.strength !== 0.6 || (art.texture.scale ?? 1) !== 1,
    print: art.print.layers.length > 0,
    sticker: art.stickerId !== null,
  };
  const goStep = (id: Step) => {
    setPop(null);
    setStep(id);
  };
  const pickTool = (t: SketchTool) => {
    if (t === sketchTool && pop !== "palette") {
      setPop(pop === "brush" ? null : "brush");
    } else {
      setSketchTool(t);
      setPop(null);
    }
  };
  const popIgnore = [
    colorRef,
    adjustRef,
    ...SKETCH_TOOLS.map((t) => ({
      get current() {
        return toolRefs.current[t.id] ?? null;
      },
    })),
  ];

  return (
    <div className="screen">
      <header className="app-header is-studio">
        <div className="app-header-side">
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => void leave()}>
            <Icon name="back" />
          </button>
        </div>
        <div className="app-header-title">
          <div className="app-header-main studio-title">
            <span className="studio-name">{art.name}</span>
            <span className={`save-dot is-${doc.status}`} role="status" aria-label={STATUS[doc.status]} title={STATUS[doc.status]} />
          </div>
          <StepPill steps={STEPS.map((s) => ({ ...s, edited: edited[s.id] }))} current={step} onPick={(id) => goStep(id as Step)} />
        </div>
        <div className="app-header-side app-header-right">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ marginRight: 6 }}
            onClick={() => (step === "sticker" ? setFinishOpen(true) : goStep(STEPS[stepIdx + 1].id))}
          >
            {step === "sticker" ? "Finish" : "Next"}
          </button>
        </div>
      </header>
      <div className="create-body">
        {doc.status === "error" ? (
          <div className="save-error-bar" role="alert" style={{ margin: "8px 12px 0" }}>
            <span>Save failed: {doc.error}</span>
            <button type="button" className="btn btn-sm" onClick={() => void doc.retry()}>
              Retry
            </button>
          </div>
        ) : null}
        <div ref={stageRef} className={`studio-stage${step === "sticker" ? " is-lined" : ""}`}>
          {step === "sticker" && preview !== "crop" ? (
            built ? (
              <StickerPreview
                artUrl={built.art}
                shapeUrl={built.shape}
                material={art.sticker.material}
                w={built.w}
                h={built.h}
                angle={art.sticker.holoAngle}
                size={canvasSize}
                interactive={preview === "shine"}
              />
            ) : (
              <div className="muted" style={{ width: canvasSize, height: canvasSize, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20 }}>
                {buildError ?? "Generating preview…"}
              </div>
            )
          ) : (
            <ArtCanvas
              size={canvasSize}
              base={base}
              checker={step === "sticker" && !art.sticker.keepPaper}
              tool={tool}
              drawOverlay={drawOverlay}
              overlayKey={overlayKey}
              onStroke={(s) => {
                if (layer?.kind !== "draw") return;
                const id = layer.id;
                change((a) => ({
                  ...a,
                  layers: a.layers.map((l) => (l.id === id && l.kind === "draw" ? { ...l, strokes: [...l.strokes, s] } : l)),
                }));
              }}
              onDragStart={(x, y) => {
                if (step !== "sticker") return;
                const r = art.sticker.crop.rect;
                const nearCorner = Math.hypot(x - (r.x + r.w), y - (r.y + r.h)) < 70;
                cropDrag.current = { mode: nearCorner ? "resize" : "move", rect: { ...r } };
              }}
              onImageDrag={(dx, dy, done) => {
                if (step === "sticker") {
                  const d = cropDrag.current;
                  if (!d) return;
                  const r = d.rect;
                  const rect =
                    d.mode === "move"
                      ? { ...r, x: Math.round(r.x + dx), y: Math.round(r.y + dy) }
                      : { ...r, w: Math.max(60, Math.round(r.w + dx)), h: Math.max(60, Math.round(r.h + dy)) };
                  setSticker({ ...art.sticker, crop: { ...art.sticker.crop, rect } }, !done);
                  if (done) cropDrag.current = null;
                  return;
                }
                if (!imgLayer) return;
                if (!imgDragOrigin.current) imgDragOrigin.current = { x: imgLayer.x, y: imgLayer.y };
                const o = imgDragOrigin.current;
                setLayer(imgLayer.id, { x: o.x + dx, y: o.y + dy }, done ? "end" : "continuous");
                if (done) imgDragOrigin.current = null;
              }}
              onMaskEnd={() => pLayer && void commitMask(pLayer)}
              onLasso={(poly) => {
                if (tool.kind !== "lasso") return;
                if (tool.purpose === "crop") {
                  setSticker({ ...art.sticker, crop: { ...art.sticker.crop, poly: poly.map((v) => Math.round(v)) } });
                } else {
                  lassoMask(poly, tool.purpose === "maskAdd");
                }
              }}
            />
          )}
          <div className="float-group float-tl">
            <button type="button" className="icon-btn" aria-label="Undo" disabled={!doc.canUndo} onClick={doc.undo}>
              <Icon name="undo" />
            </button>
            <button type="button" className="icon-btn" aria-label="Redo" disabled={!doc.canRedo} onClick={doc.redo}>
              <Icon name="redo" />
            </button>
          </div>
          {step === "draw" && layer ? (
            <button type="button" className="canvas-chip" onClick={() => setLayersOpen(true)}>
              <Icon name={layer.kind === "image" ? "image2" : "layers"} size={15} />
              {layer.name}
            </button>
          ) : null}
          {step === "paper" ? (
            <button type="button" className="canvas-chip" onClick={() => setPaperOpen(true)}>
              <Icon name="sheetPaper" size={15} />
              {textureById(art.texture.id).name}
            </button>
          ) : null}
          {step === "print" ? (
            <>
              <button type="button" className="canvas-chip" onClick={() => setInksOpen(true)}>
                {pLayer ? (
                  <>
                    <span className="ink-chip is-lg" style={{ background: pLayer.color }} />
                    {inkLabel(pLayer)}
                  </>
                ) : (
                  <>
                    <Icon name="plus" size={15} />
                    Add ink
                  </>
                )}
              </button>
              <button
                ref={viewRef}
                type="button"
                className={`float-group float-tr view-btn${printView !== "composite" ? " is-on" : ""}`}
                aria-label="View"
                aria-haspopup="menu"
                onClick={() => setViewOpen((v) => !v)}
              >
                <Icon name={PRINT_VIEWS.find((v) => v.id === printView)?.icon ?? "viewComposite"} />
                <Icon name="chev" size={14} />
              </button>
              <Dropdown
                open={viewOpen}
                anchor={viewRef}
                align="end"
                minWidth={190}
                onClose={() => setViewOpen(false)}
                items={PRINT_VIEWS.map((v) => ({
                  icon: v.icon,
                  label: v.id === printView ? <b>{v.label}</b> : v.label,
                  highlighted: v.id === printView,
                  trail: v.id === printView ? <Icon name="check" size={18} /> : undefined,
                  onSelect: () => setPrintView(v.id),
                }))}
              />
            </>
          ) : null}
          {step === "sticker" ? (
            <button
              type="button"
              className={`float-group float-tr view-btn${shine ? " is-on" : ""}`}
              aria-label="Shine preview"
              aria-pressed={shine}
              onClick={() => setShine((v) => !v)}
            >
              <Icon name="sparkle" />
            </button>
          ) : null}
        </div>

        {step === "draw" ? (
          <>
            <StudioBar>
              {imgLayer ? (
                <div className="studio-tools">
                  <LabeledTool icon="wand" label={imgLayer.maskAssetId ? "Background" : "Remove BG"} onClick={() => setBgLayer(imgLayer.id)} />
                  <LabeledTool icon="sliders" label="Adjust" active={pop === "image"} btnRef={adjustRef} onClick={() => setPop(pop === "image" ? null : "image")} />
                </div>
              ) : (
                <div className="studio-tools">
                  {SKETCH_TOOLS.map((t) => (
                    <ToolButton
                      key={t.id}
                      icon={t.icon}
                      label={t.label}
                      active={sketchTool === t.id}
                      btnRef={(el) => {
                        toolRefs.current[t.id] = el;
                      }}
                      onClick={() => pickTool(t.id)}
                    />
                  ))}
                </div>
              )}
              <div className="studio-sep" />
              <div className="studio-right">
                {imgLayer ? null : (
                  <ColorButton
                    color={color}
                    disabled={sketchTool === "eraser"}
                    btnRef={colorRef}
                    onClick={() => setPop(pop === "palette" ? null : "palette")}
                  />
                )}
                <ToolButton icon="layers" label="Layers" count={art.layers.length} onClick={() => { setPop(null); setLayersOpen(true); }} />
              </div>
            </StudioBar>
            <BrushPopover
              open={pop === "brush" && !imgLayer}
              onClose={() => setPop(null)}
              tool={sketchTool}
              setting={brushes[sketchTool]}
              color={color}
              onChange={(b) => setBrush(sketchTool, b)}
              ignore={popIgnore}
            />
            <PalettePopover
              open={pop === "palette" && !imgLayer}
              onClose={() => setPop(null)}
              color={color}
              onPick={(c) => {
                setColor(c);
                if (sketchTool === "eraser") setSketchTool("pen");
              }}
              ignore={popIgnore}
            />
            {imgLayer ? (
              <ImageAdjustPopover
                open={pop === "image"}
                onClose={() => setPop(null)}
                layer={imgLayer}
                onChange={(patch) => setLayer(imgLayer.id, patch, "continuous")}
                onEnd={() => setLayer(imgLayer.id, {}, "end")}
                ignore={popIgnore}
              />
            ) : null}
          </>
        ) : null}

        {step === "paper" ? (
          <>
            <PaperStrip
              value={art.texture.id}
              onPick={(id) => change((a) => ({ ...a, texture: { ...a.texture, id } }))}
              onAdjust={() => setPop(pop === "texture" ? null : "texture")}
              onAll={() => {
                setPop(null);
                setPaperOpen(true);
              }}
              adjustRef={texAdjustRef}
              adjustOpen={pop === "texture"}
            />
            <TexturePopover
              open={pop === "texture"}
              onClose={() => setPop(null)}
              texture={art.texture}
              onChange={(patch) => change((a) => ({ ...a, texture: { ...a.texture, ...patch } }), "continuous")}
              onEnd={() => change((a) => a, "end")}
              ignore={[texAdjustRef]}
            />
          </>
        ) : null}

        {step === "print" ? (
          <>
            <StudioBar>
              <div className="studio-tools is-tight">
                {MASK_TOOLS.map((t) => (
                  <ToolButton
                    key={t.id}
                    icon={t.icon}
                    label={t.label}
                    active={maskTool === t.id}
                    disabled={!pLayer || !art.print.enabled}
                    btnRef={(el) => {
                      toolRefs.current[`m-${t.id}`] = el;
                    }}
                    onClick={() => {
                      if (t.id === maskTool && (t.id === "brush" || t.id === "erase")) {
                        setPop(pop === "maskSize" ? null : "maskSize");
                      } else {
                        setMaskTool(t.id);
                        setPop(null);
                      }
                    }}
                  />
                ))}
              </div>
              <div className="studio-sep" />
              <div className="studio-right" style={{ gap: 2 }}>
                <ColorButton
                  color={pLayer?.color ?? "#c8c8c8"}
                  disabled={!pLayer}
                  btnRef={inkColorRef}
                  onClick={() => pLayer && setPop(pop === "inkColor" ? null : "inkColor")}
                />
                <ToolButton icon="layers" label="Inks" count={art.print.layers.length} onClick={() => { setPop(null); setInksOpen(true); }} />
                <ToolButton icon="sliders" label="Print settings" disabled={!pLayer} onClick={() => { setPop(null); setParamsOpen(true); }} />
              </div>
            </StudioBar>
            <MaskSizePopover
              open={pop === "maskSize"}
              onClose={() => setPop(null)}
              size={brushSize}
              onSize={setBrushSize}
              ignore={MASK_TOOLS.map((t) => ({ get current() { return toolRefs.current[`m-${t.id}`] ?? null; } }))}
            />
            <InkColorPopover
              open={pop === "inkColor" && pLayer !== null}
              onClose={() => setPop(null)}
              color={pLayer?.color ?? ""}
              onPick={(c) => pLayer && setPrintLayer({ ...pLayer, color: c })}
              ignore={[inkColorRef]}
            />
          </>
        ) : null}

        {step === "sticker" ? (
          <>
            <StudioBar>
              <div className="studio-tools is-spread">
                <LabeledTool
                  icon="material"
                  label="Material"
                  active={pop === "material"}
                  btnRef={(el) => {
                    stickerRefs.current.material = el;
                  }}
                  onClick={() => setPop(pop === "material" ? null : "material")}
                />
                <LabeledTool
                  icon="scissors2"
                  label="Cut"
                  active={pop === "cut"}
                  btnRef={(el) => {
                    stickerRefs.current.cut = el;
                  }}
                  onClick={() => setPop(pop === "cut" ? null : "cut")}
                />
                <LabeledTool
                  icon="sheetPaper"
                  label={art.sticker.keepPaper ? "Paper" : "No paper"}
                  active={art.sticker.keepPaper}
                  onClick={() => setSticker({ ...art.sticker, keepPaper: !art.sticker.keepPaper })}
                />
              </div>
            </StudioBar>
            <MaterialPopover
              open={pop === "material"}
              onClose={() => setPop(null)}
              s={art.sticker}
              onChange={setSticker}
              ignore={[{ get current() { return stickerRefs.current.material ?? null; } }]}
            />
            <CutPopover
              open={pop === "cut"}
              onClose={() => setPop(null)}
              s={art.sticker}
              onChange={setSticker}
              onAutoFit={autoFitCrop}
              ignore={[{ get current() { return stickerRefs.current.cut ?? null; } }]}
            />
          </>
        ) : null}
      </div>

      <PaperSheet open={paperOpen} onClose={() => setPaperOpen(false)} value={art.texture.id} onPick={(id) => change((a) => ({ ...a, texture: { ...a.texture, id } }))} />

      <InksSheet
        open={inksOpen}
        onClose={() => setInksOpen(false)}
        layers={art.print.layers}
        rt={rt}
        rtTick={rtTick}
        empty={emptyMasks}
        activeId={activePrint}
        enabled={art.print.enabled}
        artLayers={art.layers}
        onEnabled={(v) => change((a) => ({ ...a, print: { ...a.print, enabled: v } }))}
        onSelect={setActivePrint}
        onAdd={() => {
          if (art.print.layers.length >= MAX_PRINT_LAYERS) return;
          const p = newPrintLayer(art.print.layers.length);
          change((a) => ({ ...a, print: { ...a.print, layers: [...a.print.layers, p] } }));
          setActivePrint(p.id);
        }}
        onUpdate={(p) => setPrintLayer(p)}
        onDuplicate={(id) => {
          if (art.print.layers.length >= MAX_PRINT_LAYERS) return;
          const src = art.print.layers.find((l) => l.id === id);
          if (!src) return;
          const copy: PrintLayer = { ...src, id: newId("pl"), name: `${inkLabel(src)} copy` };
          change((a) => {
            const i = a.print.layers.findIndex((l) => l.id === id);
            const layers = [...a.print.layers];
            layers.splice(i + 1, 0, copy);
            return { ...a, print: { ...a.print, layers } };
          });
          setActivePrint(copy.id);
        }}
        onDelete={(id) => {
          change((a) => ({ ...a, print: { ...a.print, layers: a.print.layers.filter((l) => l.id !== id) } }));
          if (activePrint === id) setActivePrint(art.print.layers.find((l) => l.id !== id)?.id ?? null);
        }}
        onReorder={(id, to) =>
          change((a) => {
            const i = a.print.layers.findIndex((l) => l.id === id);
            if (i < 0 || to < 0 || to >= a.print.layers.length || i === to) return a;
            const layers = [...a.print.layers];
            const [l] = layers.splice(i, 1);
            layers.splice(to, 0, l);
            return { ...a, print: { ...a.print, layers } };
          })
        }
        onFromLayer={maskFromLayer}
        onClearMask={clearMask}
        onInkColor={(id) => {
          setActivePrint(id);
          setInksOpen(false);
          setPop("inkColor");
        }}
      />

      <PrintParamsSheet open={paramsOpen && step === "print"} onClose={() => setParamsOpen(false)} layer={pLayer} onUpdate={setPrintLayer} />

      <LayersSheet
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        art={art}
        rt={rt}
        activeId={activeLayer}
        onSelect={setActiveLayer}
        onPatch={(id, patch) => setLayer(id, patch)}
        onDuplicate={duplicateLayer}
        onDelete={deleteLayer}
        onReorder={reorderLayer}
        onAddSketch={() => {
          addDrawLayer();
          setLayersOpen(false);
        }}
        onImport={() => {
          setLayersOpen(false);
          void addImageLayer();
        }}
      />

      <BgRemoveSheet
        open={bgLayer !== null}
        layer={(art.layers.find((l) => l.id === bgLayer && l.kind === "image") as ImageLayer | undefined) ?? null}
        rt={rt}
        onClose={() => setBgLayer(null)}
        onApply={(maskId) => {
          if (!bgLayer) return;
          setLayer(bgLayer, { maskAssetId: maskId } as Partial<ArtLayer>);
        }}
      />

      <FinishSheet
        open={finishOpen}
        defaultName={art.name === "Untitled artwork" ? "" : art.name}
        defaultCategory={(stickers.data ?? []).find((s) => s.id === art.stickerId)?.category ?? ""}
        categories={categories}
        busy={finishing}
        result={result}
        canReturn={Boolean(returnTo)}
        onClose={() => {
          setFinishOpen(false);
          setResult(null);
        }}
        onSave={async (name, category) => {
          if (!rt) return;
          setFinishing(true);
          try {
            await doc.flush();
            const r = await finishSticker(doc.latest.current, rt, { name, category });
            commit(r.artwork, false);
            setResult({ sticker: r.sticker, version: r.version });
            toast("Sticker saved", "success");
          } catch (err) {
            toast(`Save failed: ${describeError(err)}`, "error");
          } finally {
            setFinishing(false);
          }
        }}
        onPaste={async () => {
          if (!result) return;
          if (returnTo) {
            await doc.flush();
            navigate(withReturn(returnTo, result.sticker.id));
          } else {
            setFinishOpen(false);
            setPlaceOpen(true);
          }
        }}
      />

      <PlacementSheet
        open={placeOpen}
        stickerId={result?.sticker.id ?? art.stickerId}
        onClose={() => setPlaceOpen(false)}
        beforeNavigate={doc.flush}
      />
    </div>
  );
}
