import { useState } from "react";
import { useLive } from "~/packages/db/events";
import { formatTimestamp } from "~/packages/db/id";
import { describeError } from "~/packages/db/idb";
import { listTrash, purgeTrash, restoreTrash, type TrashEntry } from "~/packages/db/repo";
import { AppHeader, BackButton, EmptyState, Screen } from "~/packages/shell/Layout";
import { ConfirmSheet } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";
import { t, tn } from "~/packages/i18n";

const KIND_LABEL: Record<TrashEntry["kind"], string> = {
  notebook: "Notebook",
  page: "Page",
  sticker: "Sticker",
  artwork: "Draft",
  image: "Image",
};

export default function Trash() {
  const toast = useToast();
  const trash = useLive(listTrash, []);
  const [purge, setPurge] = useState<TrashEntry | null>(null);
  const [purgeAll, setPurgeAll] = useState(false);
  const list = trash.data ?? [];

  return (
    <Screen header={<AppHeader title={t("Trash")} left={<BackButton to="/settings" />} />} bodyStyle={{ padding: 16 }}>
      <p className="muted small" style={{ marginTop: 0 }}>{t("Deleted items stay here until you delete them permanently. Restoring a page also restores its notebook.")}</p>
      {trash.error ? <div className="save-error-bar">{trash.error}</div> : null}
      {!trash.loading && list.length === 0 ? (
        <EmptyState title={t("Trash is empty")} />
      ) : (
        <>
          {list.map((e) => (
            <div key={`${e.kind}:${e.id}`} className="card row" style={{ marginBottom: 8, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
                <div className="muted small">
                  <span className="badge">{t(KIND_LABEL[e.kind])}</span> {e.detail} · {t("Deleted {x}", { x: formatTimestamp(e.deletedAt, false) })}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void restoreTrash(e)
                    .then(() => toast(t("Restored"), "success"))
                    .catch((err) => toast(describeError(err), "error"))
                }
              >
                {t("Restore")}
              </button>
              <button type="button" className="btn btn-sm btn-danger-text" onClick={() => setPurge(e)}>
                {t("Delete permanently")}
              </button>
            </div>
          ))}
          {list.length > 1 ? (
            <button type="button" className="btn btn-block btn-danger-text" style={{ marginTop: 12 }} onClick={() => setPurgeAll(true)}>
              {t("Empty trash")}
            </button>
          ) : null}
        </>
      )}
      <ConfirmSheet
        open={purge !== null}
        title={t("Delete permanently?")}
        danger
        confirmText={t("Delete permanently")}
        message={t("\"{title}\" will be deleted and can't be recovered. Stickers already in your diary won't be affected.", { title: purge?.title ?? "" })}
        onClose={() => setPurge(null)}
        onConfirm={() => {
          const e = purge;
          setPurge(null);
          if (e) void purgeTrash(e).catch((err) => toast(describeError(err), "error"));
        }}
      />
      <ConfirmSheet
        open={purgeAll}
        title={t("Empty trash?")}
        danger
        confirmText={t("Delete all permanently")}
        message={tn(list.length, "{n} item will be permanently deleted. This can't be undone.", "{n} items will be permanently deleted. This can't be undone.")}
        onClose={() => setPurgeAll(false)}
        onConfirm={async () => {
          setPurgeAll(false);
          try {
            for (const e of list) await purgeTrash(e);
            toast(t("Trash emptied"), "success");
          } catch (err) {
            toast(describeError(err), "error");
          }
        }}
      />
    </Screen>
  );
}
