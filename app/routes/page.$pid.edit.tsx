import { useParams } from "@remix-run/react";
import { useEffect, useState } from "react";
import { getPage, listPages } from "~/packages/db/repo";
import type { Page } from "~/packages/db/types";
import { PageEditor } from "~/packages/editor/PageEditor";
import { AppHeader, BackButton, EmptyState, Screen } from "~/packages/shell/Layout";
import { t } from "~/packages/i18n";

export default function EditPage() {
  const { pid = "" } = useParams();
  const [state, setState] = useState<{ page: Page | null; pages: Page[] } | null>(null);

  // Load once per page: the editor owns the document afterwards so live
  // database refreshes never clobber unsaved edits.
  useEffect(() => {
    let alive = true;
    setState(null);
    (async () => {
      const page = (await getPage(pid)) ?? null;
      const pages = page ? await listPages(page.notebookId) : [];
      if (alive) setState({ page, pages });
    })().catch(() => {
      if (alive) setState({ page: null, pages: [] });
    });
    return () => {
      alive = false;
    };
  }, [pid]);

  if (!state) {
    return <Screen header={<AppHeader title={t("Loading…")} />}>{null}</Screen>;
  }
  if (!state.page || state.page.deletedAt) {
    return (
      <Screen header={<AppHeader title={t("Page not found")} left={<BackButton to="/diary" />} />}>
        <EmptyState title={t("This page doesn't exist or is in the trash")} />
      </Screen>
    );
  }
  return <PageEditor key={pid} initial={state.page} pages={state.pages} />;
}
