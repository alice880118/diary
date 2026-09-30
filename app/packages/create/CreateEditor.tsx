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
import { DEFAULT_PEN, PenPanel, type PenState } from "../drawing/PenPanel";
import type { SaveStatus } from "../editor/useEditorDoc";
import { MAX_PRINT_LAYERS, newPrintLayer } from "../print/layers";
import { Icon } from "../shell/Icon";
import { AppHeader } from "../shell/Layout";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";
import { useElementSize } from "../shell/useSize";
import { buildSticker, cropBaseShape } from "../sticker/build";
import { PlacementSheet } from "../sticker/PlacementSheet";
import { finishSticker } from "../sticker/save";
import { ArtCanvas, type ArtTool } from "./ArtCanvas";
import { BgRemoveSheet } from "./BgRemoveSheet";
import { FinishSheet } from "./FinishSheet";
import { PrintPanel, type MaskTool, type PrintView } from "./PrintPanel";
import { StickerPanel } from "./StickerPanel";
import { StickerPreview } from "./StickerPreview";
import { TexturePanel } from "./TexturePanel";
import "./create.css";

type Step = "draw" | "paper" | "print" | "sticker";

const STEPS: { id: Step; label: string }[] = [
  { id: "draw", label: "1 Sketch" },
  { id: "paper", label: "2 Paper" },
  { id: "print", label: "3 Print" },
  { id: "sticker", label: "4 Sticker" },
];

const STATUS: Record<SaveStatus, string> = {
  saved: "Saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
};

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
  const [pen, setPen] = useState<PenState>(DEFAULT_PEN);
  const [maskTool, setMaskTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(48);
  const [printView, setPrintView] = useState<PrintView>("composite");
  const [preview, setPreview] = useState<"static" | "shine" | "crop">("static");
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [built, setBuilt] = useState<{ art: string; shape: string; w: number; h: number } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [bgLayer, setBgLayer] = useState<string | null>(removeBgLayer);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<{ sticker: Sticker; version: StickerVersion } | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const session = useRef(false);
  const imgDragOrigin = useRef<{ x: number; y: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const body = useElementSize(bodyRef);
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

  const moveLayer = (id: string, dir: -1 | 1) =>
    change((a) => {
      const i = a.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= a.layers.length) return a;
      const layers = [...a.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...a, layers };
    });

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

  const maskFromLayer = (artLayerId: string) => {
    if (!pLayer || !rt) return;
    const c = rt.printMasks.get(pLayer.id);
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
    void commitMask(pLayer);
    toast("Area created from layer");
  };

  const clearMask = () => {
    if (!pLayer) return;
    const c = rtRef.current?.printMasks.get(pLayer.id);
    if (!c) return;
    ctx2d(c).clearRect(0, 0, ART_W, ART_H);
    void commitMask(pLayer);
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
  }

  const drawOverlay = (ctx: CanvasRenderingContext2D) => {
    if (step === "draw" && layer?.kind === "image") {
      const l = layer;
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate((l.rot * Math.PI) / 180);
      ctx.scale(l.scale, l.scale);
      ctx.setLineDash([12 / l.scale, 8 / l.scale]);
      ctx.lineWidth = 3 / l.scale;
      ctx.strokeStyle = "#3868b8";
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
      t.fillStyle = "#3868b8";
      t.fillRect(0, 0, shape.width, shape.height);
      ctx.globalAlpha = 0.18;
      ctx.drawImage(shape, 0, 0, ART_W, ART_H);
      ctx.globalAlpha = 1;
    }
  };

  const overlayKey = `${step}|${activeLayer}|${activePrint}|${printView}|${preview}|${rtTick}|${JSON.stringify(
    step === "draw" && layer?.kind === "image" ? [layer.x, layer.y, layer.scale, layer.rot, layer.crop] : null,
  )}|${step === "sticker" ? JSON.stringify(art.sticker.crop) : ""}|${pLayer?.color}`;

  /* ---------- layout ---------- */

  const canvasSize = Math.max(200, Math.min(body.width - 24, Math.round(body.height * 0.5)));
  const imgLayer = layer?.kind === "image" ? (layer as ImageLayer) : null;
  const categories = Array.from(new Set((stickers.data ?? []).map((s) => s.category).filter(Boolean)));

  return (
    <div className="screen">
      <AppHeader
        left={
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => void leave()}>
            <Icon name="back" />
          </button>
        }
        title={art.name}
        subtitle={`${STATUS[doc.status]}${art.stickerId ? " · Has sticker version" : " · Draft"}`}
        right={
          <button type="button" className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={() => (step === "sticker" ? setFinishOpen(true) : setStep(STEPS[STEPS.findIndex((s) => s.id === step) + 1].id))}>
            {step === "sticker" ? "Finish" : "Next"}
          </button>
        }
      />
      <div ref={bodyRef} className="create-body">
        <div className="tabs" style={{ margin: "8px 12px 6px" }}>
          {STEPS.map((s) => (
            <button key={s.id} type="button" className={`tab${step === s.id ? " is-active" : ""}`} onClick={() => setStep(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        {doc.status === "error" ? (
          <div className="save-error-bar" role="alert" style={{ margin: "0 12px 6px" }}>
            <span>Save failed: {doc.error}</span>
            <button type="button" className="btn btn-sm" onClick={() => void doc.retry()}>
              Retry
            </button>
          </div>
        ) : null}
        <div className="create-stage">
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
              onImageDrag={(dx, dy, done) => {
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
        </div>
        <div className="row-between" style={{ padding: "0 8px" }}>
          <div className="row" style={{ gap: 0 }}>
            <button type="button" className="icon-btn" aria-label="Undo" disabled={!doc.canUndo} onClick={doc.undo}>
              <Icon name="undo" />
            </button>
            <button type="button" className="icon-btn" aria-label="Redo" disabled={!doc.canRedo} onClick={doc.redo}>
              <Icon name="redo" />
            </button>
          </div>
          <span className="muted small">
            {step === "draw"
              ? imgLayer
                ? "Drag to move the image"
                : "Draw on the canvas · Pinch to zoom"
              : step === "print"
                ? pLayer
                  ? "Set this ink layer's area on the canvas"
                  : "Add an ink layer to start printing"
                : step === "sticker"
                  ? "Adjust material and crop"
                  : "Choose a paper texture"}
          </span>
        </div>

        <div className="create-panel">
          {step === "draw" ? (
            <>
              <div className="section-title" style={{ marginTop: 4 }}>Layers (top first)</div>
              {[...art.layers].reverse().map((l) => {
                const idx = art.layers.findIndex((x) => x.id === l.id);
                const active = l.id === activeLayer;
                return (
                  <div key={l.id} className="row layer-row" style={{ borderColor: active ? "var(--accent)" : undefined }}>
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => setActiveLayer(l.id)}>
                      {renaming === l.id ? (
                        <input
                          className="input"
                          autoFocus
                          defaultValue={l.name}
                          style={{ minHeight: 34, padding: "4px 8px" }}
                          onBlur={(e) => {
                            setLayer(l.id, { name: e.target.value.trim() || l.name });
                            setRenaming(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      ) : (
                        <div style={{ fontWeight: active ? 600 : 400 }}>
                          {active ? "▶ " : ""}
                          {l.name}
                          <span className="muted small"> · {l.kind === "draw" ? "Sketch" : "Image"}</span>
                        </div>
                      )}
                    </div>
                    <button type="button" className="icon-btn" style={{ minWidth: 36 }} aria-label={l.visible ? "Hide" : "Show"} onClick={() => setLayer(l.id, { visible: !l.visible })}>
                      <Icon name={l.visible ? "eye" : "eyeOff"} size={18} />
                    </button>
                    <button type="button" className="icon-btn" style={{ minWidth: 36 }} aria-label="Move up" disabled={idx === art.layers.length - 1} onClick={() => moveLayer(l.id, 1)}>
                      <Icon name="up" size={18} />
                    </button>
                    <button type="button" className="icon-btn" style={{ minWidth: 36 }} aria-label="Move down" disabled={idx === 0} onClick={() => moveLayer(l.id, -1)}>
                      <Icon name="down" size={18} />
                    </button>
                  </div>
                );
              })}
              <div className="row-wrap" style={{ margin: "6px 0 10px" }}>
                <button type="button" className="btn btn-sm" onClick={addDrawLayer}>
                  <Icon name="plus" size={16} /> Sketch layer
                </button>
                <button type="button" className="btn btn-sm" onClick={() => void addImageLayer()}>
                  <Icon name="image" size={16} /> Import image
                </button>
                {layer ? (
                  <>
                    <button type="button" className="btn btn-sm" onClick={() => setRenaming(layer.id)}>
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        const copy = { ...structuredClone(layer), id: newId("ly"), name: `${layer.name} copy` } as ArtLayer;
                        change((a) => {
                          const i = a.layers.findIndex((x) => x.id === layer.id);
                          const layers = [...a.layers];
                          layers.splice(i + 1, 0, copy);
                          return { ...a, layers };
                        });
                        setActiveLayer(copy.id);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={art.layers.length <= 1}
                      onClick={() => {
                        change((a) => ({ ...a, layers: a.layers.filter((x) => x.id !== layer.id) }));
                        setActiveLayer(art.layers.find((x) => x.id !== layer.id)?.id ?? null);
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
              {layer?.kind === "draw" ? (
                <PenPanel pen={pen} onChange={setPen} allowSelect={false} maxWidth={80} />
              ) : imgLayer ? (
                <div className="card">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setBgLayer(imgLayer.id)}>
                    {imgLayer.maskAssetId ? "Adjust background removal" : "Remove background"}
                  </button>
                  <label className="small" style={{ display: "block", marginTop: 8 }}>
                    Scale {Math.round(imgLayer.scale * 100)}%
                    <input type="range" min={5} max={300} value={Math.round(imgLayer.scale * 100)} onChange={(e) => setLayer(imgLayer.id, { scale: Number(e.target.value) / 100 }, "continuous")} onPointerUp={() => setLayer(imgLayer.id, {}, "end")} />
                  </label>
                  <label className="small" style={{ display: "block" }}>
                    Rotate {Math.round(imgLayer.rot)}°
                    <input type="range" min={-180} max={180} value={Math.round(imgLayer.rot)} onChange={(e) => setLayer(imgLayer.id, { rot: Number(e.target.value) }, "continuous")} onPointerUp={() => setLayer(imgLayer.id, {}, "end")} />
                  </label>
                  <div className="small" style={{ marginTop: 4 }}>Crop (top / bottom / left / right)</div>
                  {(["t", "b", "l", "r"] as const).map((k) => (
                    <input
                      key={k}
                      type="range"
                      min={0}
                      max={45}
                      value={Math.round(imgLayer.crop[k] * 100)}
                      aria-label={`Crop ${k}`}
                      onChange={(e) => setLayer(imgLayer.id, { crop: { ...imgLayer.crop, [k]: Number(e.target.value) / 100 } }, "continuous")}
                      onPointerUp={() => setLayer(imgLayer.id, {}, "end")}
                    />
                  ))}
                  <p className="muted small">The original image is kept; background removal and crop can always be undone.</p>
                </div>
              ) : null}
            </>
          ) : null}

          {step === "paper" ? (
            <TexturePanel
              value={art.texture.id}
              strength={art.texture.strength}
              onChange={(id, strength) => change((a) => ({ ...a, texture: { id, strength } }), id === art.texture.id ? "continuous" : "discrete")}
            />
          ) : null}

          {step === "print" ? (
            <PrintPanel
              layers={art.print.layers}
              enabled={art.print.enabled}
              activeId={activePrint}
              empty={emptyMasks}
              tool={maskTool}
              brushSize={brushSize}
              view={printView}
              artLayers={art.layers}
              onEnabled={(v) => change((a) => ({ ...a, print: { ...a.print, enabled: v } }))}
              onSelect={setActivePrint}
              onAdd={() => {
                if (art.print.layers.length >= MAX_PRINT_LAYERS) return;
                const p = newPrintLayer(art.print.layers.length);
                change((a) => ({ ...a, print: { ...a.print, layers: [...a.print.layers, p] } }));
                setActivePrint(p.id);
              }}
              onUpdate={setPrintLayer}
              onDuplicate={(id) => {
                if (art.print.layers.length >= MAX_PRINT_LAYERS) return;
                const src = art.print.layers.find((l) => l.id === id);
                if (!src) return;
                const copy: PrintLayer = { ...src, id: newId("pl"), name: `${src.name} copy` };
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
                setActivePrint(art.print.layers.find((l) => l.id !== id)?.id ?? null);
              }}
              onMove={(id, dir) =>
                change((a) => {
                  const i = a.print.layers.findIndex((l) => l.id === id);
                  const j = i + dir;
                  if (j < 0 || j >= a.print.layers.length) return a;
                  const layers = [...a.print.layers];
                  [layers[i], layers[j]] = [layers[j], layers[i]];
                  return { ...a, print: { ...a.print, layers } };
                })
              }
              onTool={setMaskTool}
              onBrushSize={setBrushSize}
              onView={setPrintView}
              onFromLayer={maskFromLayer}
              onClearMask={clearMask}
            />
          ) : null}

          {step === "sticker" ? (
            <StickerPanel s={art.sticker} onChange={setSticker} onAutoFit={autoFitCrop} previewMode={preview} onPreviewMode={setPreview} />
          ) : null}
        </div>
      </div>

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
