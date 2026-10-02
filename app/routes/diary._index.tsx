import { useNavigate } from "@remix-run/react";
import { useState } from "react";
import { formatDateShort } from "~/packages/db/id";
import { StickerArt } from "~/packages/sticker/StickerArt";
import { Tape } from "~/packages/shell/Tape";
import { useLive } from "~/packages/db/events";
import { describeError } from "~/packages/db/idb";
import {
  countPagesByNotebook,
  createNotebook,
  getSettings,
  listNotebooks,
  moveNotebook,
  trashNotebook,
  updateNotebook,
  updateSettings,
} from "~/packages/db/repo";
import type { Notebook, Page, StickerObject, TextObject } from "~/packages/db/types";
import { NotebookCover } from "~/packages/notebook/NotebookCover";
import { NotebookForm, type NotebookFormValue } from "~/packages/notebook/NotebookForm";
import { Onboarding } from "~/packages/notebook/Onboarding";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, EmptyState, Screen, SettingsLink } from "~/packages/shell/Layout";
import { ConfirmSheet, Menu, Sheet } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";
import { t, tn } from "~/packages/i18n";

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("Just now");
  if (min < 60) return t("{n} min ago", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("{n} hr ago", { n: hr });
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Bookshelf() {
  const navigate = useNavigate();
  const toast = useToast();
  const data = useLive(async () => {
    const [notebooks, settings, pages] = await Promise.all([
      listNotebooks(),
      getSettings(),
      countPagesByNotebook(),
    ]);
    return { notebooks, settings, pages };
  }, []);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState<"new" | Notebook | null>(null);
  const [menuFor, setMenuFor] = useState<Notebook | null>(null);
  const [deleting, setDeleting] = useState<Notebook | null>(null);
  const [formValid, setFormValid] = useState(false);

  const create = async (v: NotebookFormValue) => {
    setBusy(true);
    try {
      const nb = await createNotebook(v);
      await updateSettings({ onboarded: true });
      setFormOpen(null);
      toast(t("Notebook created"), "success");
      navigate(`/diary/${nb.id}`);
    } catch (err) {
      toast(describeError(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const edit = async (nb: Notebook, v: NotebookFormValue) => {
    setBusy(true);
    try {
      await updateNotebook(nb.id, v);
      setFormOpen(null);
      toast(t("Updated"), "success");
    } catch (err) {
      toast(describeError(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (data.loading && !data.data) {
    return <Screen header={<AppHeader title={t("Notebooks")} />}>{null}</Screen>;
  }
  if (data.error && !data.data) {
    return (
      <Screen header={<AppHeader title={t("Notebooks")} />}>
        <EmptyState title={t("Couldn't read local data")} hint={data.error} />
      </Screen>
    );
  }
  const { notebooks, settings, pages } = data.data!;

  if (!settings.onboarded && notebooks.length === 0) {
    return (
      <Screen header={<AppHeader title={t("Welcome")} right={<SettingsLink />} />}>
        <Onboarding busy={busy} onCreate={create} />
      </Screen>
    );
  }

  const totalPages = [...pages.entries()].reduce((n, [id, list]) => (notebooks.some((nb) => nb.id === id) ? n + list.length : n), 0);
  const nbIds = new Set(notebooks.map((nb) => nb.id));
  let last: Page | null = null;
  for (const [id, list] of pages) {
    if (!nbIds.has(id)) continue;
    for (const p of list) if (!last || p.updatedAt > last.updatedAt) last = p;
  }
  const lastNb = last ? notebooks.find((nb) => nb.id === last!.notebookId) : null;

  return (
    <Screen
      nav
      bodyClassName="journal-bg"
      header={
        <AppHeader
          title={t("Notebooks")}
          subtitle={
            notebooks.length
              ? `${tn(notebooks.length, "{n} notebook", "{n} notebooks")} · ${tn(totalPages, "{n} page", "{n} pages")}`
              : undefined
          }
          right={
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("New notebook")}
                onClick={() => setFormOpen("new")}
              >
                <Icon name="plus" />
              </button>
              <SettingsLink />
            </>
          }
        />
      }
    >
      <div className="pad">
        {last && lastNb ? <ContinueCard page={last} notebook={lastNb} /> : null}
        <div className="nb-grid">
          {notebooks.map((nb) => (
            <div key={nb.id} className="nb-cell">
              <button
                type="button"
                className="nb-open"
                onClick={() => navigate(`/diary/${nb.id}`)}
                aria-label={t("Open {name}", { name: nb.name })}
              >
                <NotebookCover cover={nb.cover} name={nb.name} width="fluid" />
              </button>
              <div className="nb-meta">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ell nb-name">{nb.name}</div>
                  <div className="ell muted nb-sub">
                    {tn(pages.get(nb.id)?.length ?? 0, "{n} page", "{n} pages")} · {relTime(nb.updatedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn nb-more"
                  aria-label={t("Actions for {name}", { name: nb.name })}
                  onClick={() => setMenuFor(nb)}
                >
                  <Icon name="more" size={18} />
                </button>
              </div>
            </div>
          ))}
          <div className="nb-cell">
            <button type="button" className="nb-new" onClick={() => setFormOpen("new")}>
              <Icon name="plus" />
              {t("New notebook")}
            </button>
          </div>
        </div>
      </div>

      <Sheet
        open={formOpen !== null}
        title={formOpen === "new" ? t("New notebook") : t("Notebook settings")}
        onClose={() => setFormOpen(null)}
        tall
        footer={
          <>
            <button type="button" className="btn" onClick={() => setFormOpen(null)}>
              {t("Cancel")}
            </button>
            <button type="submit" form="nb-form" className="btn btn-primary" disabled={busy || !formValid}>
              {busy ? t("Working…") : formOpen === "new" ? t("Create") : t("Save")}
            </button>
          </>
        }
      >
        {formOpen === "new" ? (
          <NotebookForm id="nb-form" busy={busy} onSubmit={create} onValidChange={setFormValid} />
        ) : formOpen ? (
          <NotebookForm
            key={formOpen.id}
            id="nb-form"
            initial={formOpen}
            busy={busy}
            onSubmit={(v) => edit(formOpen, v)}
            onValidChange={setFormValid}
          />
        ) : null}
      </Sheet>

      <Menu
        open={menuFor !== null}
        title={menuFor?.name ?? ""}
        onClose={() => setMenuFor(null)}
        items={
          menuFor
            ? [
                { get label() { return t("Open"); }, onSelect: () => navigate(`/diary/${menuFor.id}`) },
                { get label() { return t("Rename / cover / default page style"); }, onSelect: () => setFormOpen(menuFor) },
                {
                  get label() { return t("Move earlier"); },
                  disabled: notebooks[0]?.id === menuFor.id,
                  onSelect: () => moveNotebook(menuFor.id, -1),
                },
                {
                  get label() { return t("Move later"); },
                  disabled: notebooks[notebooks.length - 1]?.id === menuFor.id,
                  onSelect: () => moveNotebook(menuFor.id, 1),
                },
                { get label() { return t("Delete"); }, danger: true, onSelect: () => setDeleting(menuFor) },
              ]
            : []
        }
      />

      <ConfirmSheet
        open={deleting !== null}
        title={t("Delete notebook")}
        danger
        confirmText={t("Move to trash")}
        message={
          <>
            {tn(
              deleting ? (pages.get(deleting.id)?.length ?? 0) : 0,
              "\"{name}\" and its {n} page will be moved to the trash. You can restore them from Settings → Trash.",
              "\"{name}\" and its {n} pages will be moved to the trash. You can restore them from Settings → Trash.",
            ).replace("{name}", deleting?.name ?? "")}
            <br />
            {t("Finished stickers in your library won't be deleted.")}
          </>
        }
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await trashNotebook(deleting.id);
            toast(t("Moved to trash"));
          } catch (err) {
            toast(describeError(err), "error");
          }
          setDeleting(null);
        }}
      />
    </Screen>
  );
}

/** Back to the most recently edited page. */
function ContinueCard({ page, notebook }: { page: Page; notebook: Notebook }) {
  const navigate = useNavigate();
  const sticker = page.objects.find((o): o is StickerObject => o.type === "sticker");
  const text = page.objects
    .filter((o): o is TextObject => o.type === "text")
    .sort((a, b) => a.y - b.y)
    .map((o) => o.text.split("\n").find((l) => l.trim()))
    .find(Boolean);
  const box = 34;
  const k = sticker ? Math.min(box / sticker.w, box / sticker.h) : 1;
  return (
    <button type="button" className="card continue-card" onClick={() => navigate(`/page/${page.id}/edit`)}>
      <Tape pattern="dots" color="#9cc7ef" style={{ top: -8, right: 22, width: 56, transform: "rotate(6deg)" }} />
      <div className="continue-thumb">
        {sticker ? (
          <div style={{ width: sticker.w * k, height: sticker.h * k, transform: "rotate(-6deg)" }}>
            <StickerArt
              artAssetId={sticker.snap.artAssetId}
              shapeAssetId={sticker.snap.shapeAssetId}
              material={sticker.snap.material}
              w={sticker.w * k}
              h={sticker.h * k}
              angle={sticker.snap.holoAngle}
            />
          </div>
        ) : (
          <Icon name="pen" size={18} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div className="lab">{t("Continue")}</div>
        <div className="ell" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
          {notebook.name} · {formatDateShort(page.date)}
        </div>
        {text ? <div className="ell muted" style={{ fontSize: 12 }}>{text}</div> : null}
      </div>
      <Icon name="chevronRight" size={18} />
    </button>
  );
}
