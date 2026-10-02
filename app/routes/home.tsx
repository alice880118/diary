import { useNavigate } from "@remix-run/react";
import { strokeBounds, translateStroke } from "~/packages/drawing/strokes";
import { useCallback, useEffect, useRef, useState } from "react";
import { DrawBar, inkConfig, useDrawPrefs, type DrawTool } from "~/packages/create/DrawTools";
import { useLive } from "~/packages/db/events";
import { formatDayChip, newId, todayLocal } from "~/packages/db/id";
import { getSettings, listNotebooks, listStickers } from "~/packages/db/repo";
import { BOARD_H, BOARD_W, type BoardItem, type BoardTexture, type HomeBoard } from "~/packages/db/types";
import { ActButton, BOARD_COLORS, BoardView, type BoardMode } from "~/packages/home/BoardView";
import { PRESETS, PresetArt, defaultItems } from "~/packages/home/presets";
import { useBoardDoc } from "~/packages/home/useBoardDoc";
import { motionAccess, onMotionAccess, requestMotionPermission, type MotionAccess } from "~/packages/home/stickerPhysics";
import { t } from "~/packages/i18n";
import { FillPicker, fillCss } from "~/packages/shell/FillPicker";
import { Icon } from "~/packages/shell/Icon";
import { BottomNav } from "~/packages/shell/Layout";
import { Sheet } from "~/packages/shell/Sheet";
import { useElementSize } from "~/packages/shell/useSize";
import { useToast } from "~/packages/shell/toast";
import { snapFromSticker } from "~/packages/sticker/snap";
import { StickerThumb } from "~/packages/sticker/StickerThumb";
import "~/packages/create/create.css";
import "~/packages/home/home.css";

const maxZ = (items: BoardItem[]) => items.reduce((m, it) => Math.max(m, it.z), 0);

export default function Home() {
  const navigate = useNavigate();
  const toast = useToast();
  const doc = useBoardDoc();
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(frameRef);
  const [mode, setMode] = useState<BoardMode>("stickers");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"add" | "board" | null>(null);
  const [prefs, setPrefs] = useDrawPrefs();
  const [tool, setTool] = useState<DrawTool>("brush");
  const [color, setColor] = useState("#e4ffb1");

  // First run still goes through the notebook onboarding.
  const gate = useLive(async () => {
    const [s, nbs] = await Promise.all([getSettings(), listNotebooks()]);
    return !s.onboarded && nbs.length === 0;
  }, []);
  useEffect(() => {
    if (gate.data) navigate("/diary", { replace: true });
  }, [gate.data, navigate]);

  const { board, commit } = doc;
  const select = useCallback((id: string | null) => setSelected(id), []);

  const add = (partial: Omit<BoardItem, "id" | "x" | "y" | "z" | "rot">) => {
    const el = scrollRef.current;
    const s = width / BOARD_W || 1;
    const cy = el ? (el.scrollTop + el.clientHeight / 2) / s : BOARD_H / 2;
    const id = newId("bi");
    commit((b) => ({
      ...b,
      items: [...b.items, { ...partial, id, x: 0.5, y: Math.min(BOARD_H - 40, cy) / BOARD_W, rot: 0, z: maxZ(b.items) + 1 }],
    }));
    setSelected(id);
    setSheet(null);
  };

  const sel = board?.items.find((it) => it.id === selected) ?? null;

  const shiftZ = (dir: 1 | -1) => {
    if (!sel) return;
    commit((b) => {
      const sorted = [...b.items].sort((a, c) => a.z - c.z);
      const i = sorted.findIndex((it) => it.id === sel.id);
      const j = i + dir;
      if (j < 0 || j >= sorted.length) return b;
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      const z = new Map(sorted.map((it, k) => [it.id, k + 1]));
      return { ...b, items: b.items.map((it) => ({ ...it, z: z.get(it.id) ?? it.z })) };
    });
  };

  const duplicate = () => {
    if (!sel) return;
    const id = newId("bi");
    commit((b) => ({ ...b, items: [...b.items, { ...sel, id, x: sel.x + 0.05, y: sel.y + 0.05, z: maxZ(b.items) + 1 }] }));
    setSelected(id);
  };

  const remove = () => {
    if (!sel) return;
    const gone = sel;
    commit((b) => ({ ...b, items: b.items.filter((it) => it.id !== gone.id) }));
    setSelected(null);
    toast(t("Sticker removed"), "info", {
      label: t("Undo"),
      onClick: () => commit((b) => (b.items.some((it) => it.id === gone.id) ? b : { ...b, items: [...b.items, gone] })),
    });
  };

  const setBg = (patch: Partial<HomeBoard["background"]>) => commit((b) => ({ ...b, background: { ...b.background, ...patch } }));

  const ink = mode === "doodle" ? inkConfig(prefs, tool, color) : null;

  // Strokes drawn in one doodle session become a single movable board item on Done.
  const doodleBase = useRef<Set<string>>(new Set());
  const startDoodle = () => {
    doodleBase.current = new Set((board?.strokes ?? []).map((st) => st.id));
    setSelected(null);
    setMode("doodle");
  };
  const finishDoodle = () => {
    setMode("stickers");
    if (!board) return;
    const fresh = board.strokes.filter((st) => !doodleBase.current.has(st.id));
    const draws = fresh.filter((st) => st.mode === "draw");
    if (!draws.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const st of draws) {
      const b = strokeBounds(st);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    const pad = 4;
    const dw = Math.max(8, maxX - minX + pad * 2);
    const dh = Math.max(8, maxY - minY + pad * 2);
    const local = fresh.map((st) => translateStroke(st, pad - minX, pad - minY));
    const freshIds = new Set(fresh.map((st) => st.id));
    commit((b) => ({
      ...b,
      // Erasers also stay on the paper layer so they keep erasing older doodles there.
      strokes: b.strokes.filter((st) => !freshIds.has(st.id) || st.mode === "erase"),
      items: [
        ...b.items,
        {
          id: newId("bi"),
          source: "doodle",
          strokes: local,
          dw,
          dh,
          x: (minX - pad + dw / 2) / BOARD_W,
          y: (minY - pad + dh / 2) / BOARD_W,
          w: dw / BOARD_W,
          rot: 0,
          z: maxZ(b.items) + 1,
        },
      ],
    }));
  };

  return (
    <div className="screen home-screen" ref={frameRef}>
      <div className="board-scroll" ref={scrollRef}>
        {board && width ? (
          <BoardView
            board={board}
            width={width}
            mode={mode}
            selectedId={selected}
            onSelect={select}
            onCommit={commit}
            ink={ink}
            scrollRef={scrollRef}
            actions={
              <>
                <ActButton icon="up" label={t("Bring forward")} onClick={() => shiftZ(1)} />
                <ActButton icon="down" label={t("Send backward")} onClick={() => shiftZ(-1)} />
                <ActButton icon="copy" label={t("Duplicate")} onClick={duplicate} />
                <ActButton icon="trash" label={t("Delete")} danger onClick={remove} />
              </>
            }
          />
        ) : null}
      </div>

      {mode === "doodle" ? (
        <div className="home-top">
          <div className="float-group">
            <button type="button" className="icon-btn" aria-label={t("Undo")} disabled={!doc.canUndo} onClick={doc.undo}>
              <Icon name="undo" />
            </button>
            <button type="button" className="icon-btn" aria-label={t("Redo")} disabled={!doc.canRedo} onClick={doc.redo}>
              <Icon name="redo" />
            </button>
          </div>
          <button type="button" className="btn btn-primary home-done" onClick={finishDoodle}>
            {t("Done")}
          </button>
        </div>
      ) : (
        <div className="home-top">
          <div className="home-date">{formatDayChip(todayLocal())}</div>
          <div className="float-group">
            <button type="button" className="icon-btn" aria-label={t("Doodle")} onClick={startDoodle}>
              <Icon name="pen" />
            </button>
            <button type="button" className="icon-btn" aria-label={t("Add sticker")} onClick={() => setSheet("add")}>
              <Icon name="stickerPlus" />
            </button>
            <button type="button" className="icon-btn" aria-label={t("Board settings")} onClick={() => setSheet("board")}>
              <Icon name="sliders" />
            </button>
          </div>
        </div>
      )}

      {mode === "doodle" ? (
        <div className="home-drawbar ink-bar">
          <DrawBar
            tool={tool}
            onTool={setTool}
            tools={["brush", "eraser"]}
            prefs={prefs}
            onPrefs={setPrefs}
            color={color}
            onColor={setColor}
            selection={null}
            onSelectionStyle={() => undefined}
            popBottom="calc(100% + 8px)"
          />
        </div>
      ) : (
        <BottomNav glass />
      )}

      <AddStickerSheet open={sheet === "add"} onClose={() => setSheet(null)} onAdd={add} />
      {board ? (
        <BoardSheet
          open={sheet === "board"}
          board={board}
          onClose={() => setSheet(null)}
          onBg={setBg}
          onClearDoodles={() => {
            const prev = { strokes: board.strokes, items: board.items };
            if (!prev.strokes.length && !prev.items.some((it) => it.source === "doodle")) return;
            commit((b) => ({ ...b, strokes: [], items: b.items.filter((it) => it.source !== "doodle") }));
            setSelected(null);
            toast(t("Doodles cleared"), "info", { label: t("Undo"), onClick: () => commit((b) => ({ ...b, ...prev })) });
          }}
          onResetStickers={() => {
            const prev = board.items;
            commit((b) => ({ ...b, items: defaultItems() }));
            setSelected(null);
            toast(t("Default stickers restored"), "info", { label: t("Undo"), onClick: () => commit((b) => ({ ...b, items: prev })) });
          }}
        />
      ) : null}
    </div>
  );
}

function AddStickerSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (it: Omit<BoardItem, "id" | "x" | "y" | "z" | "rot">) => void;
}) {
  const [tab, setTab] = useState<"playful" | "paper" | "mine">("playful");
  const mine = useLive(() => listStickers(), []);
  const tabs: [typeof tab, string][] = [
    ["playful", t("Playful")],
    ["paper", t("Paper")],
    ["mine", t("My stickers")],
  ];
  return (
    <Sheet open={open} title={t("Add sticker")} onClose={onClose} height={520}>
      <div className="utabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="add-grid">
        {tab === "mine"
          ? (mine.data ?? []).map((st) => {
              const snap = snapFromSticker(st);
              if (!snap) return null;
              return (
                <button key={st.id} type="button" className="add-cell" aria-label={st.name} onClick={() => onAdd({ source: "sticker", snap, w: 0.34 })}>
                  <StickerThumb sticker={st} size={64} />
                </button>
              );
            })
          : PRESETS.filter((p) => p.set === tab && p.id !== "squiggle").map((p) => (
              <button
                key={p.id}
                type="button"
                className={`add-cell${p.ratio < 0.6 ? " is-wide" : ""}`}
                onClick={() => onAdd({ source: "preset", presetId: p.id, w: p.w })}
              >
                <div className="add-art">
                  <div className={`board-preset${p.id.startsWith("icon-") ? " is-icon" : ""}`}>
                    <PresetArt id={p.id} />
                  </div>
                </div>
              </button>
            ))}
      </div>
      {tab === "mine" && mine.data && !mine.data.length ? <p className="muted small">{t("No stickers yet. Make one in Create.")}</p> : null}
    </Sheet>
  );
}

/** Phone motion status for the sway effect, with an explicit Allow button (a real tap, as iOS requires). */
function MotionRow() {
  const [access, setAccess] = useState<MotionAccess>(motionAccess());
  const [live, setLive] = useState(false);
  useEffect(() => onMotionAccess(setAccess), []);
  useEffect(() => {
    // Shows whether sensor readings actually arrive.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      setLive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setLive(false), 1500);
    };
    window.addEventListener("devicemotion", on);
    return () => {
      window.removeEventListener("devicemotion", on);
      clearTimeout(timer);
    };
  }, []);
  const status =
    access === "unsupported"
      ? t("This browser has no motion sensor access.")
      : access === "denied"
        ? t("Motion access was declined. Clear this site's data in Safari settings, then allow it again.")
        : access === "unknown"
          ? t("Allow motion access to let stickers sway when you tilt or shake the phone.")
          : live
            ? t("On: tilt or shake the phone.")
            : t("Allowed, waiting for sensor readings. In-app browsers (LINE, Instagram…) may block them; open in Safari or Chrome.");
  return (
    <div className="motion-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="motion-title">
          <span className={`motion-dot${access === "granted" && live ? " is-on" : ""}`} aria-hidden />
          {t("Sway with phone motion")}
        </div>
        <div className="muted small">{status}</div>
      </div>
      {access === "unknown" ? (
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void requestMotionPermission()}>
          {t("Allow")}
        </button>
      ) : null}
    </div>
  );
}

function BoardSheet({
  open,
  board,
  onClose,
  onBg,
  onClearDoodles,
  onResetStickers,
}: {
  open: boolean;
  board: HomeBoard;
  onClose: () => void;
  onBg: (p: Partial<HomeBoard["background"]>) => void;
  onClearDoodles: () => void;
  onResetStickers: () => void;
}) {
  const bg = board.background;
  const custom = bg.color === "custom";
  const textures: [BoardTexture, string][] = [
    ["smooth", t("Smooth")],
    ["grain", t("Grain")],
    ["paper", t("Paper")],
  ];
  return (
    <Sheet open={open} title={t("Board")} onClose={onClose}>
      <div className="field-label">
        {t("Color")} <span className="field-aside">{custom ? t("Custom") : BOARD_COLORS.find((c) => c.id === bg.color)?.label}</span>
      </div>
      <div className="board-colors">
        {BOARD_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.label}
            aria-pressed={bg.color === c.id}
            className={bg.color === c.id ? "is-active" : ""}
            style={{ background: c.css }}
            onClick={() => onBg({ color: c.id })}
          />
        ))}
        <button
          type="button"
          aria-label={t("Custom")}
          aria-pressed={custom}
          className={`is-custom${custom ? " is-active" : ""}`}
          style={custom && bg.custom ? { background: fillCss(bg.custom) } : undefined}
          onClick={() => onBg({ color: "custom", custom: bg.custom ?? { kind: "gradient", from: "#d9c8f2", to: "#cfe4fb", angle: 180 } })}
        >
          {custom ? null : <Icon name="palette" size={18} />}
        </button>
      </div>
      {custom && bg.custom ? <FillPicker value={bg.custom} onChange={(f) => onBg({ color: "custom", custom: f })} /> : null}
      <div className="field-label">{t("Texture")}</div>
      <div className="tabs">
        {textures.map(([id, label]) => (
          <button key={id} type="button" className={`tab${bg.texture === id ? " is-active" : ""}`} onClick={() => onBg({ texture: id })}>
            {label}
          </button>
        ))}
      </div>
      <MotionRow />
      <label className="row-between board-toggle">
        <span>{t("Background shapes")}</span>
        <input type="checkbox" role="switch" className="toggle" checked={bg.shapes} onChange={(e) => onBg({ shapes: e.target.checked })} />
      </label>
      <div className="board-links">
        <button type="button" className="menu-item is-danger" disabled={!board.strokes.length && !board.items.some((it) => it.source === "doodle")} onClick={onClearDoodles}>
          {t("Clear doodles")}
        </button>
        <button type="button" className="menu-item" onClick={onResetStickers}>
          {t("Reset to default stickers")}
        </button>
      </div>
    </Sheet>
  );
}

