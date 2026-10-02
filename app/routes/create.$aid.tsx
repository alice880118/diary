import { useParams, useSearchParams } from "@remix-run/react";
import { useEffect, useState } from "react";
import { CreateEditor } from "~/packages/create/CreateEditor";
import { getArtwork } from "~/packages/db/repo";
import type { Artwork } from "~/packages/db/types";
import { AppHeader, BackButton, EmptyState, Screen } from "~/packages/shell/Layout";
import { t } from "~/packages/i18n";

function safeReturn(v: string | null) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

export default function CreateArtwork() {
  const { aid = "" } = useParams();
  const [params] = useSearchParams();
  const [art, setArt] = useState<Artwork | null | undefined>(undefined);

  // Load once: the editor owns the document afterwards.
  useEffect(() => {
    let alive = true;
    setArt(undefined);
    getArtwork(aid)
      .then((a) => alive && setArt(a && !a.deletedAt ? a : null))
      .catch(() => alive && setArt(null));
    return () => {
      alive = false;
    };
  }, [aid]);

  if (art === undefined) {
    return <Screen header={<AppHeader title={t("Loading…")} />}>{null}</Screen>;
  }
  if (art === null) {
    return (
      <Screen header={<AppHeader title={t("Artwork not found")} left={<BackButton to="/create" />} />}>
        <EmptyState title={t("This artwork doesn't exist or is in the trash")} />
      </Screen>
    );
  }
  return (
    <CreateEditor
      key={aid}
      initial={art}
      returnTo={safeReturn(params.get("return"))}
      removeBgLayer={params.get("removebg")}
    />
  );
}
