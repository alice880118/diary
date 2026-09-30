import { Link, useNavigate } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import { ArtThumb } from "~/packages/art/ArtThumb";
import { blankArtwork, imageLayerFromAsset } from "~/packages/art/create";
import { ExportControls } from "~/packages/create/FinishSheet";
import { useAssetUrl } from "~/packages/db/assetUrl";
import { useLive } from "~/packages/db/events";
import { formatTimestamp, newId } from "~/packages/db/id";
import { describeError } from "~/packages/db/idb";
import {
  duplicateSticker,
  findStickerUsage,
  getArtwork,
  getAsset,
  listArtworks,
  listLibraryImages,
  listStickers,
  renameAsset,
  saveArtwork,
  saveSticker,
  trashAsset,
  trashSticker,
} from "~/packages/db/repo";
import type { Asset, Sticker, StickerVersion } from "~/packages/db/types";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, EmptyState, Screen, SettingsLink } from "~/packages/shell/Layout";
import { ConfirmSheet, Sheet } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";
import { latestVersion } from "~/packages/sticker/snap";
import { StickerThumb } from "~/packages/sticker/StickerThumb";
import { PlacementSheet } from "~/packages/sticker/PlacementSheet";
import { StickerArt } from "~/packages/sticker/StickerArt";
import { MATERIALS } from "~/packages/sticker/StickerArt";
import "~/packages/create/create.css";

type Tab = "stickers" | "drafts" | "images";

function ImageTile({ asset }: { asset: Asset }) {
  const { url, missing } = useAssetUrl(asset.id);
  if (missing) return <div className="muted small">Missing asset</div>;
  return url ? <img src={url} alt={asset.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : null;
}

function StickerDetail({
  sticker,
  usage,
  onClose,
}: {
  sticker: Sticker;
  usage: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(sticker.name);
  const [category, setCategory] = useState(sticker.category);
  const [vno, setVno] = useState(latestVersion(sticker)?.no ?? 0);
  const [placing, setPlacing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const version: StickerVersion | null = sticker.versions.find((v) => v.no === vno) ?? latestVersion(sticker);

  useEffect(() => {
    setName(sticker.name);
    setCategory(sticker.category);
  }, [sticker.id, sticker.name, sticker.category]);

  const saveMeta = async () => {
    const n = name.trim();
    if (!n) {
      setName(sticker.name);
      return;
    }
    if (n === sticker.name && category.trim() === sticker.category) return;
    try {
      await saveSticker({ ...sticker, name: n, category: category.trim() });
      toast("Updated", "success");
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  const reEdit = async () => {
    if (!version) return;
    try {
      const art = await getArtwork(version.artworkId);
      if (art && !art.deletedAt) {
        navigate(`/create/${art.id}`);
        return;
      }
      // The source artwork is gone: rebuild an editable copy from the snapshot.
      const now = Date.now();
      const copy = {
        ...structuredClone(version.artworkSnapshot),
        id: newId("aw"),
        stickerId: sticker.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await saveArtwork(copy);
      toast("The original draft was deleted, so it was rebuilt from this version");
      navigate(`/create/${copy.id}`);
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  const mat = MATERIALS.find((m) => m.id === version?.material);
  const k = version ? Math.min(200 / version.w, 200 / version.h) : 1;

  return (
    <>
      <Sheet open title="Sticker details" onClose={onClose} tall>
        {version ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 230,
              background: "repeating-linear-gradient(transparent 0 27px, #c9d6e6 27px 28px), #fffdf8",
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ position: "relative", width: version.w * k, height: version.h * k }}>
              <StickerArt
                artAssetId={version.artAssetId}
                shapeAssetId={version.shapeAssetId}
                material={version.material}
                w={version.w * k}
                h={version.h * k}
                angle={version.holoAngle}
              />
            </div>
          </div>
        ) : (
          <EmptyState title="This sticker has no usable versions" />
        )}
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} onBlur={() => void saveMeta()} />
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <input className="input" value={category} maxLength={20} onChange={(e) => setCategory(e.target.value)} onBlur={() => void saveMeta()} placeholder="Uncategorized" />
        </label>
        <div className="muted small" style={{ marginBottom: 10 }}>
          Material: {mat?.label ?? "—"} · Created {formatTimestamp(sticker.createdAt, false)} · Used {usage} {usage === 1 ? "time" : "times"} in diary
        </div>

        {sticker.versions.length > 1 ? (
          <>
            <div className="section-title">Versions</div>
            <div className="hscroll" style={{ marginBottom: 12 }}>
              {[...sticker.versions].reverse().map((v) => (
                <button key={v.no} type="button" className={`chip${v.no === version?.no ? " is-active" : ""}`} onClick={() => setVno(v.no)}>
                  Version {v.no} · {formatTimestamp(v.createdAt, false)}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <div className="row-wrap" style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={!version} onClick={() => setPlacing(true)}>
            Add to diary
          </button>
          <button type="button" className="btn btn-sm" disabled={!version} onClick={() => void reEdit()}>
            Edit again
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              void duplicateSticker(sticker.id)
                .then(() => toast("Duplicated", "success"))
                .catch((err) => toast(describeError(err), "error"))
            }
          >
            Duplicate
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDel(true)}>
            Delete
          </button>
        </div>
        {version ? (
          <>
            <div className="section-title">Export PNG (version {version.no})</div>
            <ExportControls sticker={sticker} version={version} />
          </>
        ) : null}
      </Sheet>
      <PlacementSheet open={placing} stickerId={sticker.id} onClose={() => setPlacing(false)} />
      <ConfirmSheet
        open={confirmDel}
        title="Delete sticker?"
        danger
        confirmText="Move to trash"
        message={
          usage > 0
            ? `This sticker is used in ${usage} ${usage === 1 ? "place" : "places"} in your diary. Deleting it from the library won't affect stickers already placed, and you can restore it from the trash.`
            : "The sticker will be moved to the trash. You can restore it in Settings."
        }
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          setConfirmDel(false);
          void trashSticker(sticker.id)
            .then(() => {
              toast("Moved to trash");
              onClose();
            })
            .catch((err) => toast(describeError(err), "error"));
        }}
      />
    </>
  );
}

function ImageDetail({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(asset.name);
  const [busy, setBusy] = useState(false);
  const { url, missing } = useAssetUrl(asset.id);

  const createFrom = async () => {
    setBusy(true);
    try {
      const a = await getAsset(asset.id);
      if (!a) throw new Error("Missing asset");
      const layer = await imageLayerFromAsset(a.id, a.blob, a.name, 1);
      const art = blankArtwork((a.name || "Imported artwork").replace(/\.[^.]+$/, "").slice(0, 30));
      art.layers = [layer, { id: newId("ly"), name: "Sketch 1", visible: true, kind: "draw", strokes: [] }];
      await saveArtwork(art);
      navigate(`/create/${art.id}?removebg=${layer.id}`);
    } catch (err) {
      toast(describeError(err), "error");
      setBusy(false);
    }
  };

  return (
    <Sheet open title="Imported image" onClose={onClose} tall>
      <div className="checker" style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, marginBottom: 12 }}>
        {missing ? <span className="muted">Missing asset</span> : url ? <img src={url} alt={asset.name} style={{ maxWidth: "100%", maxHeight: "100%" }} /> : null}
      </div>
      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="input"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim();
            if (n && n !== asset.name) void renameAsset(asset.id, n).catch((err) => toast(describeError(err), "error"));
          }}
        />
      </label>
      <div className="muted small" style={{ marginBottom: 12 }}>
        {asset.w}×{asset.h} · {Math.round(asset.blob.size / 1024)} KB · {formatTimestamp(asset.createdAt, false)}
      </div>
      <div className="row-wrap">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || missing} onClick={() => void createFrom()}>
          {busy ? "Processing…" : "Make a sticker"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={() =>
            void trashAsset(asset.id)
              .then(() => {
                toast("Moved to trash");
                onClose();
              })
              .catch((err) => toast(describeError(err), "error"))
          }
        >
          Delete
        </button>
      </div>
      <p className="muted small">Deleting the original image won't affect finished stickers or diary pages.</p>
    </Sheet>
  );
}

export default function AssetsHome() {
  const [tab, setTab] = useState<Tab>("stickers");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [openSticker, setOpenSticker] = useState<string | null>(null);
  const [openImage, setOpenImage] = useState<string | null>(null);
  const stickers = useLive(listStickers, []);
  const arts = useLive(listArtworks, []);
  const images = useLive(listLibraryImages, []);
  const usage = useLive(findStickerUsage, []);

  const cats = useMemo(
    () => Array.from(new Set((stickers.data ?? []).map((s) => s.category).filter(Boolean))).sort(),
    [stickers.data],
  );
  const needle = q.trim().toLowerCase();
  const shownStickers = (stickers.data ?? []).filter(
    (s) => (!cat || s.category === cat) && (!needle || s.name.toLowerCase().includes(needle) || s.category.toLowerCase().includes(needle)),
  );
  const drafts = (arts.data ?? []).filter((a) => !needle || a.name.toLowerCase().includes(needle));
  const shownImages = (images.data ?? []).filter((a) => !needle || a.name.toLowerCase().includes(needle));
  const sticker = (stickers.data ?? []).find((s) => s.id === openSticker) ?? null;
  const image = (images.data ?? []).find((a) => a.id === openImage) ?? null;

  return (
    <Screen nav header={<AppHeader title="Library" right={<SettingsLink />} />} bodyStyle={{ padding: 16 }}>
      <div className="tabs" style={{ marginBottom: 10 }}>
        {(
          [
            ["stickers", `Stickers ${stickers.data?.length ?? ""}`],
            ["drafts", `Drafts ${arts.data?.length ?? ""}`],
            ["images", `Images ${images.data?.length ?? ""}`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`tab${tab === id ? " is-active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <Icon name="search" size={18} />
        <input className="input" style={{ flex: 1 }} placeholder="Search by name or category" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {tab === "stickers" ? (
        <>
          {cats.length ? (
            <div className="hscroll" style={{ marginBottom: 12 }}>
              <button type="button" className={`chip${cat === null ? " is-active" : ""}`} onClick={() => setCat(null)}>
                All
              </button>
              {cats.map((c) => (
                <button key={c} type="button" className={`chip${cat === c ? " is-active" : ""}`} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          ) : null}
          {(stickers.data ?? []).length === 0 ? (
            <EmptyState
              title="No stickers yet"
              hint="Draw one or import a photo in Create. Finished stickers show up here."
              action={
                <Link to="/create" className="btn btn-primary">
                  Go to Create
                </Link>
              }
            />
          ) : shownStickers.length === 0 ? (
            <EmptyState title="No matching stickers" hint="Try a different keyword or category." />
          ) : (
            <div className="create-home-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {shownStickers.map((s) => (
                <button key={s.id} type="button" className="create-tile" onClick={() => setOpenSticker(s.id)}>
                  <div className="create-tile-thumb">
                    <StickerThumb sticker={s} size={80} />
                  </div>
                  <div className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === "drafts" ? (
        drafts.length === 0 ? (
          <EmptyState title={needle ? "No matching drafts" : "No drafts"} />
        ) : (
          <div className="create-home-grid">
            {drafts.map((a) => (
              <Link key={a.id} to={`/create/${a.id}`} className="create-tile" style={{ textDecoration: "none" }}>
                <div className="create-tile-thumb">
                  <ArtThumb art={a} />
                </div>
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div className="muted small">{a.stickerId ? "Has sticker" : "Draft"} · {formatTimestamp(a.updatedAt, false)}</div>
              </Link>
            ))}
          </div>
        )
      ) : null}

      {tab === "images" ? (
        shownImages.length === 0 ? (
          <EmptyState title={needle ? "No matching images" : "No imported images yet"} hint="Original photos you import in Create are kept here." />
        ) : (
          <div className="create-home-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {shownImages.map((a) => (
              <button key={a.id} type="button" className="create-tile" onClick={() => setOpenImage(a.id)}>
                <div className="create-tile-thumb">
                  <ImageTile asset={a} />
                </div>
                <div className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.name || "Untitled"}
                </div>
              </button>
            ))}
          </div>
        )
      ) : null}

      {sticker ? <StickerDetail sticker={sticker} usage={usage.data?.get(sticker.id) ?? 0} onClose={() => setOpenSticker(null)} /> : null}
      {image ? <ImageDetail asset={image} onClose={() => setOpenImage(null)} /> : null}
    </Screen>
  );
}
