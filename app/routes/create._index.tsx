import { Link, useNavigate } from "@remix-run/react";
import { useState } from "react";
import { ArtThumb } from "~/packages/art/ArtThumb";
import { createArtworkFromFile } from "~/packages/art/create";
import { ImportError, pickFile } from "~/packages/assets/importImage";
import { useLive } from "~/packages/db/events";
import { formatTimestamp } from "~/packages/db/id";
import { describeError } from "~/packages/db/idb";
import { duplicateArtwork, listArtworks, trashArtwork } from "~/packages/db/repo";
import type { Artwork } from "~/packages/db/types";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, EmptyState, Screen, SettingsLink } from "~/packages/shell/Layout";
import { Menu } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";
import "~/packages/create/create.css";

export default function CreateHome() {
  const navigate = useNavigate();
  const toast = useToast();
  const arts = useLive(listArtworks, []);
  const [menu, setMenu] = useState<Artwork | null>(null);
  const [importing, setImporting] = useState(false);

  const all = (arts.data ?? []).filter((a) => !a.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
  const drafts = all.filter((a) => !a.stickerId);
  const done = all.filter((a) => a.stickerId);

  const importImage = async () => {
    const file = await pickFile();
    if (!file) return;
    setImporting(true);
    try {
      const { art, layerId } = await createArtworkFromFile(file);
      navigate(`/create/${art.id}?removebg=${layerId}`);
    } catch (err) {
      toast(err instanceof ImportError ? err.message : describeError(err), "error");
    } finally {
      setImporting(false);
    }
  };

  const grid = (list: Artwork[]) => (
    <div className="create-home-grid" style={{ marginBottom: 20 }}>
      {list.map((a) => (
        <div key={a.id} className="create-tile" style={{ position: "relative" }}>
          <Link to={`/create/${a.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            <div className="create-tile-thumb">
              <ArtThumb art={a} />
            </div>
            <div style={{ fontWeight: 600, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
            <div className="muted small">{formatTimestamp(a.updatedAt)}</div>
          </Link>
          <button
            type="button"
            className="icon-btn"
            aria-label="More"
            style={{ position: "absolute", right: 4, bottom: 4 }}
            onClick={() => setMenu(a)}
          >
            <Icon name="more" size={18} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <Screen nav header={<AppHeader title="Create" right={<SettingsLink />} />} bodyStyle={{ padding: 16 }}>
      <div className="row" style={{ gap: 10, marginBottom: 20 }}>
        <Link to="/create/new" className="btn btn-primary" style={{ flex: 1 }}>
          <Icon name="plus" size={18} /> Blank canvas
        </Link>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={importing} onClick={() => void importImage()}>
          <Icon name="image" size={18} /> {importing ? "Importing…" : "Import image"}
        </button>
      </div>
      <p className="muted small" style={{ marginTop: -10, marginBottom: 16 }}>
        Sketch → Paper texture → Print → Sticker. When it's done, add it to your diary or export a PNG.
      </p>

      {arts.loading && !arts.data ? null : all.length === 0 ? (
        <EmptyState title="No artwork yet" hint="Start drawing on a blank canvas, or import a photo to turn into a sticker." />
      ) : (
        <>
          {drafts.length ? (
            <>
              <div className="section-title">Drafts</div>
              {grid(drafts)}
            </>
          ) : null}
          {done.length ? (
            <>
              <div className="section-title">Recently finished</div>
              {grid(done)}
            </>
          ) : null}
        </>
      )}

      <Menu
        open={menu !== null}
        title={menu?.name ?? ""}
        onClose={() => setMenu(null)}
        items={
          menu
            ? [
                { label: "Continue editing", onSelect: () => navigate(`/create/${menu.id}`) },
                {
                  label: "Duplicate",
                  onSelect: () =>
                    void duplicateArtwork(menu.id)
                      .then(() => toast("Duplicated", "success"))
                      .catch((err) => toast(describeError(err), "error")),
                },
                {
                  label: "Move to trash",
                  danger: true,
                  onSelect: () =>
                    void trashArtwork(menu.id)
                      .then(() => toast("Moved to trash. You can restore it in Settings."))
                      .catch((err) => toast(describeError(err), "error")),
                },
              ]
            : []
        }
      />
    </Screen>
  );
}
