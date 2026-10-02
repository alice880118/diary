import { describeError } from "../db/idb";
import { useEffect, useRef, useState } from "react";
import { createCanvas, ctx2d, persistMask, type ArtRuntime } from "../art/runtime";
import { maskToCanvas, removeBackground, RemovalCancelled } from "../bgremove/removeBackground";
import type { ImageLayer } from "../db/types";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";
import { t } from "../i18n";

type Phase = "idle" | "running" | "done" | "failed";

export function BgRemoveSheet({
  open,
  layer,
  rt,
  onClose,
  onApply,
}: {
  open: boolean;
  layer: ImageLayer | null;
  rt: ArtRuntime | null;
  onClose: () => void;
  onApply: (maskAssetId: string | null) => void;
}) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [tolerance, setTolerance] = useState(40);
  const [showOriginal, setShowOriginal] = useState(false);
  const [brush, setBrush] = useState<"erase" | "restore" | null>(null);
  const [brushSize, setBrushSize] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [ver, setVer] = useState(0);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef<{ x: number; y: number } | null>(null);

  const img = layer && rt ? rt.images.get(layer.workAssetId) : undefined;

  useEffect(() => {
    if (!open || !layer) return;
    setPhase(layer.maskAssetId ? "done" : "idle");
    setError(null);
    setProgress(0);
    setBrush(null);
    const existing = rt?.imageMasks.get(layer.id);
    if (existing) {
      const c = createCanvas(layer.imgW, layer.imgH);
      ctx2d(c).drawImage(existing, 0, 0);
      mask.current = c;
    } else {
      mask.current = null;
    }
    setVer((v) => v + 1);
  }, [open, layer, rt]);

  useEffect(() => {
    const c = viewRef.current;
    if (!c || !layer || !img) return;
    const ctx = ctx2d(c);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (!showOriginal && mask.current) {
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask.current, 0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "source-over";
    }
  }, [ver, showOriginal, img, layer]);

  const run = async () => {
    if (!layer || !img) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase("running");
    setError(null);
    setProgress(0);
    try {
      const c = createCanvas(layer.imgW, layer.imgH);
      const ctx = ctx2d(c);
      ctx.drawImage(img, 0, 0, layer.imgW, layer.imgH);
      const data = ctx.getImageData(0, 0, layer.imgW, layer.imgH);
      const m = await removeBackground(data, tolerance, setProgress, ctrl.signal);
      let removed = 0;
      for (let i = 0; i < m.length; i++) if (m[i] < 128) removed++;
      if (removed < m.length * 0.01) {
        setPhase("failed");
        setError("Couldn't detect the background (it's too busy or too close to the subject's color). Adjust the tolerance and retry, or fix it by hand with the erase brush.");
        mask.current = maskToCanvas(m, layer.imgW, layer.imgH);
        setVer((v) => v + 1);
        return;
      }
      mask.current = maskToCanvas(m, layer.imgW, layer.imgH);
      setShowOriginal(false);
      setPhase("done");
      setVer((v) => v + 1);
    } catch (err) {
      if (err instanceof RemovalCancelled) {
        setPhase(mask.current ? "done" : "idle");
        toast(t("Background removal cancelled; original kept"));
      } else {
        setPhase("failed");
        setError(describeError(err));
      }
    }
  };

  const paintAt = (e: React.PointerEvent) => {
    if (!brush || !layer || !mask.current || !viewRef.current) return;
    const r = viewRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * layer.imgW;
    const y = ((e.clientY - r.top) / r.height) * layer.imgH;
    const ctx = ctx2d(mask.current);
    const from = painting.current ?? { x, y };
    ctx.save();
    ctx.globalCompositeOperation = brush === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineWidth = (brushSize * layer.imgW) / r.width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
    ctx.restore();
    painting.current = { x, y };
    setVer((v) => v + 1);
  };

  const ensureMask = () => {
    if (!mask.current && layer) {
      const c = createCanvas(layer.imgW, layer.imgH);
      const ctx = ctx2d(c);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      mask.current = c;
    }
  };

  const viewW = 300;
  const viewH = layer ? (viewW * layer.imgH) / layer.imgW : 300;

  return (
    <Sheet
      open={open}
      title={t("Remove background")}
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      tall
      footer={
        <div className="row-between">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={phase === "running"}
            onClick={() => {
              onApply(null);
              onClose();
            }}
          >
            {t("Use original")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={phase === "running" || !mask.current}
            onClick={async () => {
              if (!mask.current) return;
              try {
                const id = await persistMask(mask.current, "Background mask");
                onApply(id);
                onClose();
              } catch (err) {
                toast(describeError(err), "error");
              }
            }}
          >
            {t("Apply")}
          </button>
        </div>
      }
    >
      {!layer || !img ? (
        <div className="muted">{t("Image data not found.")}</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <canvas
              ref={viewRef}
              width={layer.imgW}
              height={layer.imgH}
              className="checker"
              style={{ width: viewW, height: viewH, borderRadius: 8, touchAction: "none", maxHeight: 320, objectFit: "contain" }}
              onPointerDown={(e) => {
                if (!brush) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                ensureMask();
                painting.current = null;
                paintAt(e);
              }}
              onPointerMove={(e) => {
                if (painting.current) paintAt(e);
              }}
              onPointerUp={() => {
                painting.current = null;
              }}
            />
          </div>
          {phase === "running" ? (
            <div style={{ margin: "12px 0" }}>
              <div className="row-between small">
                <span>{t("Processing on device… (nothing is uploaded)")}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div style={{ height: 8, background: "var(--muted)", borderRadius: 999, overflow: "hidden", margin: "6px 0" }}>
                <div style={{ width: `${progress * 100}%`, height: "100%", background: "var(--accent)" }} />
              </div>
              <button type="button" className="btn btn-sm" onClick={() => abort.current?.abort()}>
                {t("Cancel")}
              </button>
            </div>
          ) : (
            <>
              {error ? <p className="field-error">{error}</p> : null}
              <label className="small">
                {t("Background tolerance {n}", { n: tolerance })}
                <input type="range" min={0} max={100} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
              </label>
              <div className="row-wrap" style={{ margin: "6px 0 10px" }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void run()}>
                  {phase === "idle" ? t("Remove background") : t("Remove again")}
                </button>
                {mask.current ? (
                  <button type="button" className={`chip${showOriginal ? " is-active" : ""}`} onClick={() => setShowOriginal((v) => !v)}>
                    {showOriginal ? t("Showing original") : t("Compare with original")}
                  </button>
                ) : null}
              </div>
              <div className="section-title" style={{ marginTop: 4 }}>{t("Edge touch-up")}</div>
              <div className="row-wrap">
                <button type="button" className={`chip${brush === "erase" ? " is-active" : ""}`} onClick={() => setBrush(brush === "erase" ? null : "erase")}>
                  {t("Erase brush")}
                </button>
                <button type="button" className={`chip${brush === "restore" ? " is-active" : ""}`} onClick={() => setBrush(brush === "restore" ? null : "restore")}>
                  {t("Restore brush")}
                </button>
              </div>
              {brush ? (
                <label className="small">
                  {t("Brush size")} {brushSize}
                  <input type="range" min={4} max={60} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
                </label>
              ) : null}
              <p className="muted small">{t("Background removal only changes what's transparent, never the colors. The original is always kept, so you can redo or restore it anytime.")}</p>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
