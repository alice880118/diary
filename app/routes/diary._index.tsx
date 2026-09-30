import { useNavigate } from "@remix-run/react";
import { useState } from "react";
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
import type { Notebook } from "~/packages/db/types";
import { NotebookCover } from "~/packages/notebook/NotebookCover";
import { NotebookForm, type NotebookFormValue } from "~/packages/notebook/NotebookForm";
import { Onboarding } from "~/packages/notebook/Onboarding";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, EmptyState, Screen, SettingsLink } from "~/packages/shell/Layout";
import { ConfirmSheet, Menu, Sheet } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
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

  const create = async (v: NotebookFormValue) => {
    setBusy(true);
    try {
      const nb = await createNotebook(v);
      await updateSettings({ onboarded: true });
      setFormOpen(null);
      toast("Notebook created", "success");
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
      toast("Updated", "success");
    } catch (err) {
      toast(describeError(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (data.loading && !data.data) {
    return <Screen header={<AppHeader title="Notebooks" />}>{null}</Screen>;
  }
  if (data.error && !data.data) {
    return (
      <Screen header={<AppHeader title="Notebooks" />}>
        <EmptyState title="Couldn't read local data" hint={data.error} />
      </Screen>
    );
  }
  const { notebooks, settings, pages } = data.data!;

  if (!settings.onboarded && notebooks.length === 0) {
    return (
      <Screen header={<AppHeader title="Welcome" right={<SettingsLink />} />}>
        <Onboarding busy={busy} onCreate={create} />
      </Screen>
    );
  }

  return (
    <Screen
      nav
      header={
        <AppHeader
          title="Notebooks"
          right={
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label="New notebook"
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
      {notebooks.length === 0 ? (
        <EmptyState
          title="No notebooks yet"
          hint="Create a notebook to start journaling."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setFormOpen("new")}>
              <Icon name="plus" size={18} /> New notebook
            </button>
          }
        />
      ) : (
        <div
          className="pad"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "22px 14px",
          }}
        >
          {notebooks.map((nb) => (
            <div key={nb.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => navigate(`/diary/${nb.id}`)}
                style={{ border: 0, background: "none", padding: 0, cursor: "pointer" }}
                aria-label={`Open ${nb.name}`}
              >
                <NotebookCover cover={nb.cover} name={nb.name} width={132} />
              </button>
              <div className="row" style={{ width: 150, marginTop: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {nb.name}
                  </div>
                  <div className="muted small">
                    {pages.get(nb.id)?.length ?? 0}{" "}
                    {(pages.get(nb.id)?.length ?? 0) === 1 ? "page" : "pages"} · {relTime(nb.updatedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Actions for ${nb.name}`}
                  onClick={() => setMenuFor(nb)}
                >
                  <Icon name="more" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={formOpen !== null}
        title={formOpen === "new" ? "New notebook" : "Notebook settings"}
        onClose={() => setFormOpen(null)}
        tall
      >
        {formOpen === "new" ? (
          <NotebookForm submitText="Create" busy={busy} onSubmit={create} />
        ) : formOpen ? (
          <NotebookForm
            key={formOpen.id}
            initial={formOpen}
            submitText="Save"
            busy={busy}
            onSubmit={(v) => edit(formOpen, v)}
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
                { label: "Open", onSelect: () => navigate(`/diary/${menuFor.id}`) },
                { label: "Rename / cover / default page style", onSelect: () => setFormOpen(menuFor) },
                {
                  label: "Move earlier",
                  disabled: notebooks[0]?.id === menuFor.id,
                  onSelect: () => moveNotebook(menuFor.id, -1),
                },
                {
                  label: "Move later",
                  disabled: notebooks[notebooks.length - 1]?.id === menuFor.id,
                  onSelect: () => moveNotebook(menuFor.id, 1),
                },
                { label: "Delete", danger: true, onSelect: () => setDeleting(menuFor) },
              ]
            : []
        }
      />

      <ConfirmSheet
        open={deleting !== null}
        title="Delete notebook"
        danger
        confirmText="Move to trash"
        message={
          <>
            "{deleting?.name}" and its {deleting ? (pages.get(deleting.id)?.length ?? 0) : 0}{" "}
            {(deleting ? (pages.get(deleting.id)?.length ?? 0) : 0) === 1 ? "page" : "pages"} will be
            moved to the trash. You can restore them from Settings → Trash.
            <br />
            Finished stickers in your library won't be deleted.
          </>
        }
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await trashNotebook(deleting.id);
            toast("Moved to trash");
          } catch (err) {
            toast(describeError(err), "error");
          }
          setDeleting(null);
        }}
      />
    </Screen>
  );
}
