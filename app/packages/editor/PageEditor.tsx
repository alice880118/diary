import { useNavigate, useSearchParams } from "@remix-run/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeImageFile, downscale, ImportError, pickFile } from "../assets/importImage";
import { useLive } from "../db/events";
import { formatDate, newId, ymOf } from "../db/id";
import { describeError } from "../db/idb";
import { duplicatePage, getSticker, listStickers, putAsset, trashPage } from "../db/repo";
import type { LinkObject, NoteObject, Page, PageObject, Sticker, TextObject } from "../db/types";
import { DrawBar, inkConfig, useDrawPrefs, type DrawTool } from "../create/DrawTools";
import { SKETCH_COLORS } from "../create/SketchTools";
import { DateSheet } from "../notebook/DateSheet";
import { fetchLinkMeta, linkBox, openExternal } from "../page/links";
import { TAPE_COLORS } from "../page/ObjectViews";
import { PageStylePicker } from "../page/PageStylePicker";
import { Icon, type IconName } from "../shell/Icon";
import { AppHeader } from "../shell/Layout";
import { useReduceMotion } from "../shell/motion";
import { ConfirmSheet, Menu, Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";
import { latestVersion, snapFromSticker } from "../sticker/snap";
import { StickerPicker } from "../sticker/StickerPicker";
import { EditorCanvas, type EditMode } from "./EditorCanvas";
import { bringIntoPage, duplicateObject, isOffPage, maxZ, normalizeZ, shiftZ } from "./geometry";
import { LayersPanel } from "./LayersPanel";
import { LinkPanel, type LinkDraft } from "./LinkPanel";
import { NotePanel } from "./NotePanel";
import { TextPanel } from "./TextPanel";
import { useEditorDoc, type SaveStatus } from "./useEditorDoc";
import "./editor.css";

type Panel = null | "text" | "sticker" | "note" | "link" | "style" | "layers" | "more" | "date";

const STATUS: Record<SaveStatus, { label: string; color: string }> = {
  saved: { label: "Saved", color: "var(--success)" },
  pending: { label: "Unsaved changes", color: "var(--warning)" },
  saving: { label: "Saving…", color: "var(--warning)" },
  error: { label: "Save failed", color: "var(--destructive)" },
};

function jitter() {
  return Math.round((Math.random() - 0.5) * 80);
}

export function PageEditor({
  initial,
  pages,
}: {
  initial: Page;
  pages: Page[];
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const reduce = useReduceMotion();
  const [params, setParams] = useSearchParams();
  const doc = useEditorDoc(initial);
  const { page, commit } = doc;
  const [mode, setMode] = useState<EditMode>("layout");
  const [inkTool, setInkTool] = useState<DrawTool>("brush");
  const [inkColor, setInkColor] = useState(SKETCH_COLORS[0]);
  const [prefs, setPrefs] = useDrawPrefs();
  const ink = inkTool === "brush" || inkTool === "eraser" ? inkConfig(prefs, inkTool, inkColor, "#fffdf8") : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [editing, setEditing] = useState<PageObject | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pendingNav = useRef<string | null>(null);
  const textRecorded = useRef(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [toolsOverflow, setToolsOverflow] = useState(false);
  const stickers = useLive(listStickers, []);

  const index = pages.findIndex((p) => p.id === page.id);
  const selected = page.objects.find((o) => o.id === selectedId) ?? null;

  /* ---------- navigation with flush ---------- */

  const leave = useCallback(
    async (to: string, replace = false) => {
      const ok = await doc.flush();
      if (!ok) {
        pendingNav.current = to;
        setLeaveError(doc.error ?? "Couldn't write to the local database");
        return;
      }
      navigate(to, { replace });
    },
    [doc, navigate],
  );

  const backTo = `/diary/${page.notebookId}/m/${ymOf(page.date)}`;

  /* ---------- object helpers ---------- */

  const addObject = useCallback(
    (o: PageObject) => {
      commit((p) => ({ ...p, objects: [...p.objects, { ...o, z: maxZ(p.objects) + 1 }] }));
      setSelectedId(o.id);
      setMode("layout");
    },
    [commit],
  );

  const updateObject = (id: string, patch: Partial<PageObject>, record = true) => {
    commit(
      (p) => ({
        ...p,
        objects: p.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as PageObject) : o)),
      }),
      record,
    );
  };

  const removeObject = (id: string, record = true) => {
    commit((p) => ({ ...p, objects: normalizeZ(p.objects.filter((o) => o.id !== id)) }), record);
    setSelectedId(null);
  };

  const addSticker = useCallback(
    (s: Sticker) => {
      const snap = snapFromSticker(s);
      if (!snap) return;
      const k = 280 / Math.max(snap.w, snap.h);
      addObject({
        id: newId("ob"),
        type: "sticker",
        x: 450 + jitter(),
        y: 560 + jitter(),
        w: snap.w * k,
        h: snap.h * k,
        rot: Math.round((Math.random() - 0.5) * 12),
        z: 0,
        locked: false,
        snap,
      });
    },
    [addObject],
  );

  // Returning from the sticker studio with a freshly made sticker.
  useEffect(() => {
    const sid = params.get("addSticker");
    if (!sid) return;
    const next = new URLSearchParams(params);
    next.delete("addSticker");
    setParams(next, { replace: true });
    getSticker(sid)
      .then((s) => {
        if (s) {
          addSticker(s);
          toast("Sticker added", "success");
        }
      })
      .catch(() => toast("Couldn't find the new sticker", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = toolsRef.current;
    if (!el) return;
    const check = () => setToolsOverflow(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    check();
    el.addEventListener("scroll", check);
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [mode, selectedId]);

  /* ---------- add tools ---------- */

  const addText = () => {
    const o: TextObject = {
      id: newId("ob"),
      type: "text",
      x: 450,
      y: 420 + jitter(),
      w: 560,
      h: 60,
      rot: 0,
      z: 0,
      locked: false,
      text: "",
      font: "sans",
      size: 40,
      color: "#2f2a25",
      align: "left",
    };
    addObject(o);
    textRecorded.current = true;
    setEditing(o);
    setPanel("text");
  };

  const addImage = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const { img } = await decodeImageFile(file);
      const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
      const small = await downscale(img, 1600, type);
      const asset = await putAsset(small.blob, {
        role: "image",
        w: small.w,
        h: small.h,
        name: file.name,
        library: true,
      });
      const k = 460 / Math.max(small.w, small.h);
      addObject({
        id: newId("ob"),
        type: "image",
        x: 450 + jitter(),
        y: 600 + jitter(),
        w: small.w * k + 16,
        h: small.h * k + 16,
        rot: Math.round((Math.random() - 0.5) * 8),
        z: 0,
        locked: false,
        assetId: asset.id,
      });
    } catch (err) {
      toast(err instanceof ImportError ? err.message : describeError(err), "error");
    }
  };

  const newNote = (): NoteObject => ({
    id: newId("ob"),
    type: "note",
    x: 450 + jitter(),
    y: 640 + jitter(),
    w: 300,
    h: 300,
    rot: Math.round((Math.random() - 0.5) * 8),
    z: 0,
    locked: false,
    color: "#fff3a6",
    shape: "square",
    text: "",
    textSize: 30,
    strokes: [],
    fix: "tape",
    tapePattern: "diagonal",
    tapeColor: TAPE_COLORS[0],
    anchor: { x: 0.5, y: 0.04 },
    sway: 0.6,
  });

  const saveLink = (d: LinkDraft) => {
    const existing = editing?.type === "link" ? editing : null;
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const urlChanged = !existing || existing.url !== d.url;
    const meta: LinkObject["meta"] = urlChanged
      ? { status: offline ? "fail" : "loading" }
      : existing.meta;
    let id: string;
    if (existing) {
      id = existing.id;
      updateObject(id, {
        url: d.url,
        title: d.title,
        display: d.display,
        ...(d.shape ? { shape: d.shape } : {}),
        ...(d.color ? { color: d.color } : {}),
        // Sticker/tag keep a user-resized box while their display is unchanged.
        ...((d.display === "sticker" || d.display === "tag") && existing.display === d.display
          ? {}
          : linkBox(d.display, existing.w)),
        meta,
      } as Partial<LinkObject>);
    } else {
      const o: LinkObject = {
        id: newId("ob"),
        type: "link",
        x: 450,
        y: 780 + jitter(),
        ...linkBox(d.display),
        rot: 0,
        z: 0,
        locked: false,
        url: d.url,
        title: d.title,
        display: d.display,
        meta,
        ...(d.shape ? { shape: d.shape } : {}),
        ...(d.color ? { color: d.color } : {}),
      };
      id = o.id;
      addObject(o);
    }
    setPanel(null);
    setEditing(null);
    if (urlChanged && !offline) {
      fetchLinkMeta(d.url).then((m) => {
        updateObject(id, { meta: m } as Partial<LinkObject>, false);
      });
    }
  };

  const openEditor = useCallback((o: PageObject) => {
    setSelectedId(o.id);
    setEditing(o);
    if (o.type === "text") {
      textRecorded.current = false;
      setPanel("text");
    } else if (o.type === "note") {
      setPanel("note");
    } else if (o.type === "link") {
      setPanel("link");
    }
  }, []);

  const closeText = () => {
    const cur = page.objects.find((o) => o.id === editing?.id);
    if (cur && cur.type === "text" && !cur.text.trim()) {
      removeObject(cur.id, false);
    }
    setPanel(null);
    setEditing(null);
  };

  const updateSnapVersion = (o: PageObject) => {
    if (o.type !== "sticker") return;
    const s = stickers.data?.find((x) => x.id === o.snap.stickerId);
    const snap = s ? snapFromSticker(s) : null;
    if (!snap) return;
    const k = Math.max(o.w, o.h) / Math.max(snap.w, snap.h);
    updateObject(o.id, { snap, w: snap.w * k, h: snap.h * k } as Partial<PageObject>);
    toast(`Updated to version ${snap.version}`, "success");
  };

  /* ---------- render helpers ---------- */

  const status = STATUS[doc.status];
  const textObj = panel === "text" ? (page.objects.find((o) => o.id === editing?.id) as TextObject | undefined) ?? null : null;
  const newerVersion =
    selected?.type === "sticker"
      ? (() => {
          const s = stickers.data?.find((x) => x.id === selected.snap.stickerId);
          const v = s ? latestVersion(s) : null;
          return v && v.no > selected.snap.version ? v.no : null;
        })()
      : null;

  const tool = (icon: IconName, label: string, onClick: () => void, opts?: { disabled?: boolean; active?: boolean; danger?: boolean }) => (
    <button
      key={label}
      type="button"
      className={`tool-btn${opts?.active ? " is-active" : ""}${opts?.danger ? " is-danger" : ""}`}
      disabled={opts?.disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );

  let bottomTools: React.ReactNode;
  if (mode === "ink") {
    bottomTools = null;
  } else if (selected) {
    const o = selected;
    bottomTools = [
      o.type === "text" || o.type === "note" || o.type === "link"
        ? tool("edit", "Edit", () => openEditor(o), { disabled: o.locked })
        : null,
      o.type === "link" ? tool("out", "Open", () => openExternal(o.url)) : null,
      newerVersion ? tool("refresh", `Update v${newerVersion}`, () => updateSnapVersion(o)) : null,
      isOffPage(o) ? tool("zoomIn", "Move back", () => updateObject(o.id, bringIntoPage(o))) : null,
      tool("copy", "Duplicate", () => {
        const c = duplicateObject(o, maxZ(page.objects) + 1);
        commit((p) => ({ ...p, objects: [...p.objects, c] }));
        setSelectedId(c.id);
      }),
      tool(o.locked ? "unlock" : "lock", o.locked ? "Unlock" : "Lock", () => updateObject(o.id, { locked: !o.locked })),
      tool("up", "Forward", () => commit((p) => ({ ...p, objects: shiftZ(p.objects, o.id, 1) }))),
      tool("down", "Backward", () => commit((p) => ({ ...p, objects: shiftZ(p.objects, o.id, -1) }))),
      tool("layers", "Layers", () => setPanel("layers")),
      tool("trash", "Delete", () => removeObject(o.id), { danger: true }),
    ];
  } else {
    bottomTools = [
      tool("text", "Text", addText),
      tool("pen", "Pen", () => {
        setSelectedId(null);
        setMode("ink");
      }),
      tool("image", "Image", () => void addImage()),
      tool("sticker", "Sticker", () => setPanel("sticker")),
      tool("note", "Note", () => {
        setEditing(newNote());
        setPanel("note");
      }),
      tool("link", "Link", () => {
        setEditing(null);
        setPanel("link");
      }),
      tool("layers", "Layers", () => setPanel("layers")),
      tool("grid", "Style", () => setPanel("style")),
    ];
  }

  return (
    <div className="editor-screen">
      <AppHeader
        left={
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => void leave(backTo)}>
            <Icon name="back" />
          </button>
        }
        title={
          <button
            type="button"
            onClick={() => setPanel("date")}
            style={{ border: 0, background: "none", font: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            {formatDate(page.date)}
          </button>
        }
        subtitle={
          <span className="editor-status">
            <span className="dot" style={{ background: status.color }} />
            {status.label} · Page {index + 1} of {pages.length}
          </span>
        }
        right={
          <button type="button" className="icon-btn" aria-label="More options" onClick={() => setPanel("more")}>
            <Icon name="more" />
          </button>
        }
      />
      {doc.status === "error" ? (
        <div className="save-error-bar" role="alert">
          <span>Save failed: {doc.error}. Your content is still on screen.</span>
          <button type="button" className="btn btn-sm" onClick={() => void doc.retry()}>
            Retry
          </button>
        </div>
      ) : null}

      <EditorCanvas
        page={page}
        mode={mode}
        ink={ink}
        inkSelect={inkTool === "select"}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCommit={(fn) => commit(fn)}
        onTransient={(fn) => commit(fn, false)}
        onEditObject={openEditor}
        reduceMotion={reduce}
        focusId={panel === "text" ? editing?.id ?? null : null}
        bottomInset={panel === "text" ? 260 : 0}
      />

      <div className="editor-bottom">
        <div className="editor-strip">
          <div className="row" style={{ gap: 0 }}>
            <button type="button" className="icon-btn" aria-label="Undo" disabled={!doc.canUndo} onClick={doc.undo}>
              <Icon name="undo" />
            </button>
            <button type="button" className="icon-btn" aria-label="Redo" disabled={!doc.canRedo} onClick={doc.redo}>
              <Icon name="redo" />
            </button>
          </div>
          <span className="muted small">
            {mode === "ink" ? "Handwriting · Pinch to zoom" : selected ? (selected.locked ? "Locked · Unlock in Layers" : "Drag to move · Corner to resize") : "Layout · Pinch to zoom"}
          </span>
          <div className="row" style={{ gap: 0 }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Previous page"
              disabled={index <= 0}
              onClick={() => void leave(`/page/${pages[index - 1]?.id}/edit`, true)}
            >
              <Icon name="chevronLeft" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Next page"
              disabled={index >= pages.length - 1}
              onClick={() => void leave(`/page/${pages[index + 1]?.id}/edit`, true)}
            >
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>
        {mode === "ink" ? (
          <div className="ink-bar">
            <DrawBar
              tool={inkTool}
              onTool={setInkTool}
              tools={["brush", "eraser", "select"]}
              prefs={prefs}
              onPrefs={setPrefs}
              color={inkColor}
              onColor={setInkColor}
              selection={null}
              onSelectionStyle={() => undefined}
              popBottom="calc(100% + 8px)"
              right={
                <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 4 }} onClick={() => setMode("layout")}>
                  Done
                </button>
              }
            />
          </div>
        ) : (
          <div className="editor-tools-wrap">
            <div className="editor-tools" ref={toolsRef}>
              {bottomTools}
            </div>
            {toolsOverflow ? (
              <div className="editor-tools-hint" aria-hidden>
                <Icon name="chevronRight" size={18} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <TextPanel
        obj={textObj}
        onClose={closeText}
        onChange={(patch) => {
          if (!textObj) return;
          const record = !textRecorded.current;
          textRecorded.current = true;
          updateObject(textObj.id, patch, record);
        }}
      />

      <Sheet open={panel === "sticker"} title="Stickers" onClose={() => setPanel(null)} tall>
        <StickerPicker
          onPick={(s) => {
            addSticker(s);
            setPanel(null);
          }}
          onCreate={() => {
            setPanel(null);
            void leave(`/create/new?return=${encodeURIComponent(`/page/${page.id}/edit`)}`);
          }}
        />
      </Sheet>

      <NotePanel
        open={panel === "note"}
        initial={editing?.type === "note" ? editing : null}
        onClose={() => {
          setPanel(null);
          setEditing(null);
        }}
        onSave={(n) => {
          if (page.objects.some((o) => o.id === n.id)) {
            updateObject(n.id, n);
          } else {
            addObject(n);
          }
          setPanel(null);
          setEditing(null);
        }}
      />

      <LinkPanel
        open={panel === "link"}
        initial={editing?.type === "link" ? editing : null}
        onClose={() => {
          setPanel(null);
          setEditing(null);
        }}
        onSave={saveLink}
      />

      <Sheet open={panel === "style"} title="Page style" onClose={() => setPanel(null)}>
        <PageStylePicker value={page.style} date={page.date} onChange={(s) => commit((p) => ({ ...p, style: s }))} />
        <p className="muted small">Changing the style only affects the background. Your content won't move or be removed.</p>
      </Sheet>

      <LayersPanel
        open={panel === "layers"}
        objects={page.objects}
        selectedId={selectedId}
        onClose={() => setPanel(null)}
        onSelect={(id) => {
          setMode("layout");
          setSelectedId(id);
        }}
        onToggleLock={(id) => {
          const o = page.objects.find((x) => x.id === id);
          if (o) updateObject(id, { locked: !o.locked });
        }}
        onShift={(id, dir) => commit((p) => ({ ...p, objects: shiftZ(p.objects, id, dir) }))}
        onBringIn={(id) => {
          const o = page.objects.find((x) => x.id === id);
          if (o) updateObject(id, bringIntoPage(o));
        }}
      />

      <DateSheet
        open={panel === "date"}
        title="Change date"
        initial={page.date}
        confirmText="Apply"
        onClose={() => setPanel(null)}
        onConfirm={(d) => {
          commit((p) => ({ ...p, date: d }));
          setPanel(null);
          toast("Date changed. The month index will update too.");
        }}
      />

      <Menu
        open={panel === "more"}
        title="Page options"
        onClose={() => setPanel(null)}
        items={[
          { label: "Reading mode", onSelect: () => void leave(`/page/${page.id}`, true) },
          { label: "Page style", onSelect: () => setPanel("style") },
          { label: "Layers", onSelect: () => setPanel("layers") },
          { label: "Change date", onSelect: () => setPanel("date") },
          {
            label: "Duplicate page",
            onSelect: async () => {
              const ok = await doc.flush();
              if (!ok) return;
              try {
                const copy = await duplicatePage(page.id);
                toast("Duplicated. Opening the copy…");
                navigate(`/page/${copy.id}/edit`, { replace: true });
              } catch (err) {
                toast(describeError(err), "error");
              }
            },
          },
          { label: "Delete page", danger: true, onSelect: () => setConfirmDelete(true) },
        ]}
      />

      <ConfirmSheet
        open={confirmDelete}
        title="Delete page"
        danger
        confirmText="Move to trash"
        message="The page will be moved to the trash. You can restore it from Settings → Trash."
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await doc.flush();
          try {
            await trashPage(page.id);
            navigate(backTo, { replace: true });
          } catch (err) {
            toast(describeError(err), "error");
          }
        }}
      />

      <Sheet
        open={leaveError !== null}
        title="Not saved"
        onClose={() => setLeaveError(null)}
        footer={
          <div className="row-end">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                const to = pendingNav.current;
                setLeaveError(null);
                if (to) navigate(to);
              }}
            >
              Discard and leave
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const ok = await doc.retry();
                if (ok) {
                  const to = pendingNav.current;
                  setLeaveError(null);
                  if (to) navigate(to);
                } else {
                  toast("Still couldn't save", "error");
                }
              }}
            >
              Retry save
            </button>
          </div>
        }
      >
        <p className="confirm-msg">
          Your recent changes couldn't be saved: {leaveError}
          <br />
          Retry, or discard these changes and leave.
        </p>
      </Sheet>
    </div>
  );
}
