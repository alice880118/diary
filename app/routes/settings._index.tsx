import { Link } from "@remix-run/react";
import { useEffect, useState } from "react";
import { applyRestore, BackupError, exportBackup, readBackup, type RestorePlan } from "~/packages/backup/backup";
import { useLive } from "~/packages/db/events";
import { formatTimestamp } from "~/packages/db/id";
import { describeError } from "~/packages/db/idb";
import { collectGarbage, getSettings, updateSettings } from "~/packages/db/repo";
import type { MotionPref } from "~/packages/db/types";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, BackButton, Screen } from "~/packages/shell/Layout";
import { Sheet } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";
import { saveOrShare } from "~/packages/sticker/exportPng";

function mb(n: number) {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function pickJson(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export default function Settings() {
  const toast = useToast();
  const settings = useLive(getSettings, []);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const refreshStorage = async () => {
    if (!navigator.storage?.estimate) return;
    try {
      const e = await navigator.storage.estimate();
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0, persisted });
    } catch {
      setStorage(null);
    }
  };

  useEffect(() => {
    void refreshStorage();
  }, []);

  const motion = settings.data?.motion ?? "system";
  const last = settings.data?.lastBackupAt;

  const doExport = async () => {
    setExporting(0);
    try {
      const { blob, name } = await exportBackup((p) => setExporting(p));
      const r = await saveOrShare(blob, name);
      if (r === "cancelled") toast("Backup save canceled");
      else toast(`Backup complete (${mb(blob.size)})`, "success");
    } catch (err) {
      toast(`Backup failed: ${describeError(err)}`, "error");
    } finally {
      setExporting(null);
    }
  };

  const doRead = async () => {
    const file = await pickJson();
    if (!file) return;
    setReading(true);
    setRestoreError(null);
    try {
      setPlan(await readBackup(file));
    } catch (err) {
      setRestoreError(err instanceof BackupError ? err.message : `Couldn't read file: ${describeError(err)}`);
    } finally {
      setReading(false);
    }
  };

  const doRestore = async () => {
    if (!plan) return;
    setRestoring(true);
    try {
      const r = await applyRestore(plan);
      toast(`Restore complete: ${r.added} added, ${r.skipped} identical skipped`, "success");
      setPlan(null);
      void refreshStorage();
    } catch (err) {
      setRestoreError(`Restore failed. Your local data wasn't changed: ${describeError(err)}`);
      setPlan(null);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Screen header={<AppHeader title="Settings" left={<BackButton to="/diary" />} />} bodyStyle={{ padding: 16 }}>
      <div className="card" style={{ marginBottom: 16, borderColor: "rgb(217 119 6 / 0.35)", boxShadow: "none" }}>
        <strong>Your data stays on this device</strong>
        <p className="small" style={{ margin: "6px 0 0" }}>
          There's no account or cloud sync. Clearing browser data, removing the app, or switching devices can erase your work, so export a backup regularly.
        </p>
      </div>

      <div className="section-title">Motion</div>
      <div className="tabs" style={{ marginBottom: 6 }}>
        {(
          [
            ["system", "System"],
            ["reduce", "Reduced"],
            ["full", "Full"],
          ] as [MotionPref, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab${motion === id ? " is-active" : ""}`}
            onClick={() => void updateSettings({ motion: id }).catch((err) => toast(describeError(err), "error"))}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="muted small" style={{ marginBottom: 18 }}>With reduced motion, pages fade instead of flipping, sticky notes don't wobble, and stickers peel off without animation.</p>

      <div className="section-title">Backup & restore</div>
      <p className="small" style={{ marginTop: 0 }}>Last backup: {last ? formatTimestamp(last) : "Never"}</p>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={exporting !== null} onClick={() => void doExport()}>
          <Icon name="download" size={18} /> {exporting !== null ? `Exporting ${Math.round(exporting * 100)}%` : "Export backup"}
        </button>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={reading} onClick={() => void doRead()}>
          <Icon name="refresh" size={18} /> {reading ? "Checking…" : "Restore from backup"}
        </button>
      </div>
      {restoreError ? (
        <div className="save-error-bar" role="alert" style={{ marginBottom: 8 }}>
          <span>{restoreError}</span>
          <button type="button" className="btn btn-sm" onClick={() => setRestoreError(null)}>
            Close
          </button>
        </div>
      ) : null}
      <p className="muted small" style={{ marginBottom: 18 }}>A backup includes all diaries, stickers, drafts, original images, and trash, saved as a single JSON file.</p>

      <div className="section-title">Storage</div>
      {storage ? (
        <>
          <p className="small" style={{ marginTop: 0 }}>
            {mb(storage.usage)} used
            {storage.quota ? ` of about ${mb(storage.quota)}` : ""} · {storage.persisted ? "Persistent storage on" : "May be cleared if the browser runs low on space"}
          </p>
          <div className="row-wrap" style={{ marginBottom: 18 }}>
            {!storage.persisted && navigator.storage?.persist ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  const ok = await navigator.storage.persist().catch(() => false);
                  toast(ok ? "Persistent storage on" : "The browser declined. Install the app or back up regularly.", ok ? "success" : "error");
                  void refreshStorage();
                }}
              >
                Request persistent storage
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                try {
                  const n = await collectGarbage();
                  toast(n ? `Cleaned up ${count(n, "unused asset")}` : "Nothing to clean up", "success");
                  void refreshStorage();
                } catch (err) {
                  toast(describeError(err), "error");
                }
              }}
            >
              Clean up unused assets
            </button>
          </div>
        </>
      ) : (
        <p className="muted small" style={{ marginBottom: 18 }}>This browser can't estimate storage usage.</p>
      )}

      <Link to="/settings/trash" className="btn btn-block" style={{ justifyContent: "space-between" }}>
        <span>
          <Icon name="trash" size={18} /> Trash
        </span>
        <Icon name="chevronRight" size={18} />
      </Link>

      <p className="muted small" style={{ marginTop: 24, textAlign: "center" }}>Paper Collage Diary · Data format v{settings.data?.schemaVersion ?? 1}</p>

      <Sheet
        open={plan !== null}
        title="Confirm restore"
        onClose={() => (restoring ? undefined : setPlan(null))}
        footer={
          <div className="row-end">
            <button type="button" className="btn" disabled={restoring} onClick={() => setPlan(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={restoring} onClick={() => void doRestore()}>
              {restoring ? "Restoring…" : "Merge & restore"}
            </button>
          </div>
        }
      >
        {plan ? (
          <>
            <p className="confirm-msg">
              Backed up: {plan.exportedAt ? formatTimestamp(plan.exportedAt) : "Unknown"}
              <br />
              Contains: {count(plan.counts.notebooks, "notebook")}, {count(plan.counts.pages, "page")}, {count(plan.counts.stickers, "sticker")}, {count(plan.counts.artworks, "draft")}, {count(plan.counts.assets, "asset")}
            </p>
            <p className="small">
              {count(plan.identical, "item")} identical to this device will be skipped.{" "}
              {plan.conflicts ? `${count(plan.conflicts, "item")} that differ will be saved as copies without overwriting existing data.` : "No conflicts."}
            </p>
            <p className="muted small">Restore runs as a single transaction: if it fails partway, your local data stays as it was.</p>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
