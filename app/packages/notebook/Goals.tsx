import { useEffect, useRef, useState } from "react";
import { describeError } from "../db/idb";
import { formatYm, monthName, newId } from "../db/id";
import { GOAL_MAX_LEN, MAX_GOALS, goalsOf, saveGoals, updateMonth } from "../db/repo";
import type { MonthGoal, MonthlyOverview } from "../db/types";
import { t, tn } from "../i18n";
import { Icon } from "../shell/Icon";
import { Sheet } from "../shell/Sheet";
import { useToast } from "../shell/toast";

const SHOWN = 3;
const monthShort = (ym: string) => monthName(Number(ym.slice(5, 7)), true);

function Box({ on, size = 15 }: { on: boolean; size?: number }) {
  return (
    <span className={`goal-box${on ? " is-on" : ""}`} style={{ width: size, height: size }} aria-hidden>
      {on ? <Icon name="check" size={size - 4} /> : null}
    </span>
  );
}

/** "This month" card on the calendar: tick goals in place; anything else opens the editor. */
export function GoalsCard({ overview, onEdit }: { overview: MonthlyOverview; onEdit: () => void }) {
  const toast = useToast();
  const goals = goalsOf(overview);
  const toggle = (g: MonthGoal) =>
    updateMonth(overview.notebookId, overview.ym, (m) => ({
      ...m,
      goals: (m.goals ?? []).map((x) => (x.id === g.id ? { ...x, done: !x.done } : x)),
    })).catch((err) => toast(describeError(err), "error"));

  if (!goals.length) {
    return (
      <div className="card goals-card" role="button" tabIndex={0} onClick={onEdit} onKeyDown={(e) => e.key === "Enter" && onEdit()}>
        <div className="lab">{t("This month")}</div>
        <div className="muted goals-empty">{t("Set a few small goals for {month}.", { month: monthName(Number(overview.ym.slice(5, 7))) })}</div>
        <span className="goals-add">
          <Icon name="plus" size={14} />
          {t("Add goals")}
        </span>
      </div>
    );
  }
  const extra = goals.length - SHOWN;
  return (
    <div className="card goals-card" role="button" tabIndex={0} onClick={onEdit} onKeyDown={(e) => e.key === "Enter" && onEdit()}>
      <div className="lab">{t("This month")}</div>
      {goals.slice(0, SHOWN).map((g) =>
        g.movedTo ? (
          <div key={g.id} className="goal-row is-moved">
            <span className="goal-box is-moved" aria-hidden>
              <Icon name="chevronRight" size={14} />
            </span>
            <span className="ell goal-text">{g.text}</span>
            <span className="goal-to">{monthShort(g.movedTo)}</span>
          </div>
        ) : (
          <button
            key={g.id}
            type="button"
            className={`goal-row${g.done ? " is-done" : ""}`}
            aria-pressed={g.done}
            onClick={(e) => {
              e.stopPropagation();
              void toggle(g);
            }}
          >
            <Box on={g.done} />
            <span className="ell goal-text">{g.text}</span>
            {g.carriedFrom ? <span className="badge goal-from">{t("from {m}", { m: monthShort(g.carriedFrom) })}</span> : null}
          </button>
        ),
      )}
      {extra > 0 ? <div className="goal-more muted">{t("+{n} more", { n: extra })}</div> : null}
    </div>
  );
}

/** Edit sheet: drag to reorder, tick, rename, delete, add (up to MAX_GOALS). */
export function GoalsSheet({ open, onClose, overview }: { open: boolean; onClose: () => void; overview: MonthlyOverview }) {
  const toast = useToast();
  const [list, setList] = useState<MonthGoal[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; y0: number; idx: number; h: number } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; dy: number } | null>(null);
  const focusId = useRef<string | null>(null);

  useEffect(() => {
    if (open) setList(goalsOf(overview));
  }, [open, overview]);

  const patch = (id: string, p: Partial<MonthGoal>) => setList((l) => l.map((g) => (g.id === id ? { ...g, ...p } : g)));
  const full = list.length >= MAX_GOALS;

  const add = () => {
    if (full) return;
    const id = newId("gl");
    focusId.current = id;
    setList((l) => [...l, { id, text: "", done: false, order: l.length }]);
  };

  const save = async () => {
    try {
      await saveGoals(overview.notebookId, overview.ym, list);
      onClose();
    } catch (err) {
      toast(describeError(err), "error");
    }
  };

  const onHandleDown = (e: React.PointerEvent, id: string) => {
    const row = (e.currentTarget as HTMLElement).closest<HTMLElement>(".goal-edit");
    if (!row) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id, y0: e.clientY, idx: list.findIndex((g) => g.id === id), h: row.offsetHeight };
    setDragging({ id, dy: 0 });
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    const shift = Math.round(dy / d.h);
    const to = Math.max(0, Math.min(list.length - 1, d.idx + shift));
    if (to !== list.findIndex((g) => g.id === d.id)) {
      setList((l) => {
        const from = l.findIndex((g) => g.id === d.id);
        const next = [...l];
        const [g] = next.splice(from, 1);
        next.splice(to, 0, g);
        return next;
      });
    }
    setDragging({ id: d.id, dy: dy - (to - d.idx) * d.h });
  };
  const onHandleUp = () => {
    drag.current = null;
    setDragging(null);
  };

  const done = list.filter((g) => g.text.trim()).length;
  return (
    <Sheet
      open={open}
      title={
        <div>
          <div>{t("This month")}</div>
          <div className="sheet-sub">
            {formatYm(overview.ym)} · {t("{n} of {max} goals", { n: done, max: MAX_GOALS })}
          </div>
        </div>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {t("Save")}
          </button>
        </>
      }
    >
      <div ref={listRef}>
        {list.map((g) => (
          <div
            key={g.id}
            className={`goal-edit${dragging?.id === g.id ? " is-dragging" : ""}`}
            style={dragging?.id === g.id ? { transform: `translateY(${dragging.dy}px)` } : undefined}
          >
            <span
              className="goal-handle"
              role="button"
              aria-label={t("Reorder")}
              onPointerDown={(e) => onHandleDown(e, g.id)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
            >
              <Icon name="grip" size={18} />
            </span>
            {g.movedTo ? (
              <span className="goal-box is-moved" title={monthShort(g.movedTo)}>
                <Icon name="chevronRight" size={14} />
              </span>
            ) : (
              <button type="button" className="goal-check" aria-pressed={g.done} aria-label={g.text || t("Goal")} onClick={() => patch(g.id, { done: !g.done })}>
                <Box on={g.done} size={18} />
              </button>
            )}
            <input
              className={`goal-input${g.done ? " is-done" : ""}`}
              value={g.text}
              maxLength={GOAL_MAX_LEN}
              placeholder={t("New goal")}
              ref={(el) => {
                if (el && focusId.current === g.id) {
                  focusId.current = null;
                  el.focus();
                }
              }}
              onChange={(e) => patch(g.id, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            {g.carriedFrom ? <span className="badge goal-from">{t("from {m}", { m: monthShort(g.carriedFrom) })}</span> : null}
            <button type="button" className="icon-btn goal-del" aria-label={t("Delete")} onClick={() => setList((l) => l.filter((x) => x.id !== g.id))}>
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="goal-new" disabled={full} onClick={add}>
        <Icon name="plus" size={18} />
        {full ? tn(MAX_GOALS, "Up to {n} goal", "Up to {n} goals") : t("Add goal")}
      </button>
    </Sheet>
  );
}
