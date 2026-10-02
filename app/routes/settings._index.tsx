import { Link } from "@remix-run/react";
import { useEffect, useState } from "react";
import { applyRestore, BackupError, exportBackup, readBackup, type RestorePlan } from "~/packages/backup/backup";
import { useLive } from "~/packages/db/events";
import { formatTimestamp } from "~/packages/db/id";
import { describeError } from "~/packages/db/idb";
import { collectGarbage, getSettings, updateSettings } from "~/packages/db/repo";
import { SCHEMA_VERSION, type MotionPref } from "~/packages/db/types";
import { Icon } from "~/packages/shell/Icon";
import { AppHeader, BackButton, Screen } from "~/packages/shell/Layout";
import { Sheet } from "~/packages/shell/Sheet";
import { useToast } from "~/packages/shell/toast";
import { saveOrShare } from "~/packages/sticker/exportPng";
import { getLang, LANGS, setLang, t, tn } from "~/packages/i18n";

function mb(n: number) {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const NOUNS: Record<string, [string, string]> = {
  notebook: ["{n} notebook", "{n} notebooks"],
  page: ["{n} page", "{n} pages"],
  sticker: ["{n} sticker", "{n} stickers"],
  draft: ["{n} draft", "{n} drafts"],
  asset: ["{n} asset", "{n} assets"],
  item: ["{n} item", "{n} items"],
  "unused asset": ["{n} unused asset", "{n} unused assets"],
};

function count(n: number, noun: string) {
  const [one, many] = NOUNS[noun] ?? ["{n} " + noun, "{n} " + noun + "s"];
  return tn(n, one, many);
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
      if (r === "cancelled") toast(t("Backup save canceled"));
      else toast(t("Backup complete ({x})", { x: mb(blob.size) }), "success");
    } catch (err) {
      toast(t("Backup failed: {x}", { x: describeError(err) }), "error");
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
      setRestoreError(err instanceof BackupError ? t(err.message) : t("Couldn't read file: {x}", { x: describeError(err) }));
    } finally {
      setReading(false);
    }
  };

  const doRestore = async () => {
    if (!plan) return;
    setRestoring(true);
    try {
      const r = await applyRestore(plan);
      toast(t("Restore complete: {added} added, {skipped} identical skipped", { added: r.added, skipped: r.skipped }), "success");
      setPlan(null);
      void refreshStorage();
    } catch (err) {
      setRestoreError(t("Restore failed. Your local data wasn't changed: {x}", { x: describeError(err) }));
      setPlan(null);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Screen header={<AppHeader title={t("Settings")} left={<BackButton to="/diary" />} />} bodyStyle={{ padding: 16 }}>
      <div className="card" style={{ marginBottom: 16, borderColor: "rgb(217 119 6 / 0.35)", boxShadow: "none" }}>
        <strong>{t("Your data stays on this device")}</strong>
        <p className="small" style={{ margin: "6px 0 0" }}>
          {t("There's no account or cloud sync. Clearing browser data, removing the app, or switching devices can erase your work, so export a backup regularly.")}
        </p>
      </div>

      <div className="section-title">{t("Language")}</div>
      <div className="tabs" style={{ marginBottom: 18 }}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" className={`tab${getLang() === l.id ? " is-active" : ""}`} lang={l.id === "zh-TW" ? "zh-Hant" : "en"} onClick={() => setLang(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="section-title">{t("Motion")}</div>
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
            {t(label)}
          </button>
        ))}
      </div>
      <p className="muted small" style={{ marginBottom: 18 }}>{t("With reduced motion, pages fade instead of flipping, sticky notes don't wobble, and stickers peel off without animation.")}</p>

      <div className="section-title">{t("Backup & restore")}</div>
      <p className="small" style={{ marginTop: 0 }}>{t("Last backup: {x}", { x: last ? formatTimestamp(last) : t("Never") })}</p>
      <div className="row" style={{ gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" style={{ flex: "1 1 150px" }} disabled={exporting !== null} onClick={() => void doExport()}>
          <Icon name="download" size={18} /> {exporting !== null ? t("Exporting {x}%", { x: Math.round(exporting * 100) }) : t("Export backup")}
        </button>
        <button type="button" className="btn" style={{ flex: "1 1 150px" }} disabled={reading} onClick={() => void doRead()}>
          <Icon name="refresh" size={18} /> {reading ? t("Checking…") : t("Restore from backup")}
        </button>
      </div>
      {restoreError ? (
        <div className="save-error-bar" role="alert" style={{ marginBottom: 8 }}>
          <span>{restoreError}</span>
          <button type="button" className="btn btn-sm" onClick={() => setRestoreError(null)}>
            {t("Close")}
          </button>
        </div>
      ) : null}
      <p className="muted small" style={{ marginBottom: 18 }}>{t("A backup includes all diaries, stickers, drafts, original images, and trash, saved as a single JSON file.")}</p>

      <div className="section-title">{t("Storage")}</div>
      {storage ? (
        <>
          <p className="small" style={{ marginTop: 0 }}>
            {storage.quota ? t("{used} used of about {quota}", { used: mb(storage.usage), quota: mb(storage.quota) }) : t("{used} used", { used: mb(storage.usage) })} · {storage.persisted ? t("Persistent storage on") : t("May be cleared if the browser runs low on space")}
          </p>
          <div className="row-wrap" style={{ marginBottom: 18 }}>
            {!storage.persisted && navigator.storage?.persist ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  const ok = await navigator.storage.persist().catch(() => false);
                  toast(ok ? t("Persistent storage on") : t("The browser declined. Install the app or back up regularly."), ok ? "success" : "error");
                  void refreshStorage();
                }}
              >
                {t("Request persistent storage")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                try {
                  const n = await collectGarbage();
                  toast(n ? t("Cleaned up {x}", { x: count(n, "unused asset") }) : t("Nothing to clean up"), "success");
                  void refreshStorage();
                } catch (err) {
                  toast(describeError(err), "error");
                }
              }}
            >
              {t("Clean up unused assets")}
            </button>
          </div>
        </>
      ) : (
        <p className="muted small" style={{ marginBottom: 18 }}>{t("This browser can't estimate storage usage.")}</p>
      )}

      <Link to="/settings/trash" className="btn btn-block" style={{ justifyContent: "space-between" }}>
        <span>
          <Icon name="trash" size={18} /> {t("Trash")}
        </span>
        <Icon name="chevronRight" size={18} />
      </Link>

      <p className="muted small" style={{ marginTop: 24, textAlign: "center" }}>Paper Collage Diary · {t("Data format v{n}", { n: SCHEMA_VERSION })}</p>

      <Sheet
        open={plan !== null}
        title={t("Confirm restore")}
        onClose={() => (restoring ? undefined : setPlan(null))}
        footer={
          <div className="row-end">
            <button type="button" className="btn" disabled={restoring} onClick={() => setPlan(null)}>
              {t("Cancel")}
            </button>
            <button type="button" className="btn btn-primary" disabled={restoring} onClick={() => void doRestore()}>
              {restoring ? t("Restoring…") : t("Merge & restore")}
            </button>
          </div>
        }
      >
        {plan ? (
          <>
            <p className="confirm-msg">
              {t("Backed up")}: {plan.exportedAt ? formatTimestamp(plan.exportedAt) : t("Unknown")}
              <br />
              {t("Contains")}: {count(plan.counts.notebooks, "notebook")}, {count(plan.counts.pages, "page")}, {count(plan.counts.stickers, "sticker")}, {count(plan.counts.artworks, "draft")}, {count(plan.counts.assets, "asset")}
            </p>
            <p className="small">
              {t("{items} identical to this device will be skipped.", { items: count(plan.identical, "item") })}{" "}
              {plan.conflicts ? t("{items} that differ will be saved as copies without overwriting existing data.", { items: count(plan.conflicts, "item") }) : t("No conflicts.")}
            </p>
            <p className="muted small">{t("Restore runs as a single transaction: if it fails partway, your local data stays as it was.")}</p>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
