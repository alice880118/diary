import { useNavigate, useSearchParams } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { createBlankArtwork } from "~/packages/art/create";
import { describeError } from "~/packages/db/idb";
import { AppHeader, BackButton, EmptyState, Screen } from "~/packages/shell/Layout";
import { t } from "~/packages/i18n";

/** Creates a blank artwork and replaces itself with the studio. */
export default function CreateNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createBlankArtwork()
      .then((art) => {
        const ret = params.get("return");
        const q = ret ? `?return=${encodeURIComponent(ret)}` : "";
        navigate(`/create/${art.id}${q}`, { replace: true });
      })
      .catch((err) => setError(describeError(err)));
  }, [navigate, params]);

  return (
    <Screen header={<AppHeader title={t("New artwork")} left={<BackButton to="/create" />} />}>
      {error ? <EmptyState title={t("Couldn't create artwork")} hint={error} /> : <EmptyState title={t("Creating…")} />}
    </Screen>
  );
}
