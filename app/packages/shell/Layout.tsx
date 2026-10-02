import { Link, useLocation } from "@remix-run/react";
import type { ReactNode } from "react";
import { t } from "../i18n";
import { Icon, type IconName } from "./Icon";
import { LanguageButton } from "../i18n/LangProvider";

export function AppHeader({
  title,
  left,
  right,
  subtitle,
}: {
  title: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="app-header">
      <div className="app-header-side">{left}</div>
      <div className="app-header-title">
        <div className="app-header-main">{title}</div>
        {subtitle ? <div className="app-header-sub">{subtitle}</div> : null}
      </div>
      <div className="app-header-side app-header-right">{right}</div>
    </header>
  );
}

export function BackButton({ to, onClick }: { to?: string; onClick?: () => void }) {
  if (to) {
    return (
      <Link to={to} className="icon-btn" aria-label={t("Back")}>
        <Icon name="back" />
      </Link>
    );
  }
  return (
    <button type="button" className="icon-btn" aria-label={t("Back")} onClick={onClick}>
      <Icon name="back" />
    </button>
  );
}

export function SettingsLink() {
  return (
    <>
      <LanguageButton />
      <Link to="/settings" className="icon-btn" aria-label={t("Settings")}>
        <Icon name="settings" />
      </Link>
    </>
  );
}

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/home", get label() { return t("Home"); }, icon: "home" },
  { to: "/diary", get label() { return t("Diary"); }, icon: "book" },
  { to: "/create", get label() { return t("Create"); }, icon: "brush" },
  { to: "/assets", get label() { return t("Library"); }, icon: "sticker" },
];

export function BottomNav({ glass = false }: { glass?: boolean }) {
  const loc = useLocation();
  return (
    <nav className={`bottom-nav${glass ? " is-glass" : ""}`} aria-label={t("Main navigation")}>
      {NAV.map((n) => {
        const active = loc.pathname.startsWith(n.to);
        return (
          <Link
            key={n.to}
            to={n.to}
            className={`bottom-nav-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={n.icon} />
            <span>{t(n.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Standard screen: 48px header, scrollable body, optional global nav. */
export function Screen({
  header,
  children,
  nav = false,
  bodyStyle,
  bodyClassName,
}: {
  header: ReactNode;
  children: ReactNode;
  nav?: boolean;
  bodyStyle?: React.CSSProperties;
  bodyClassName?: string;
}) {
  return (
    <div className={`screen${nav ? " has-nav" : ""}`}>
      {header}
      <main className={`screen-body ${bodyClassName ?? ""}`} style={bodyStyle}>
        {children}
      </main>
      {nav ? <BottomNav /> : null}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      {hint ? <div className="empty-hint">{hint}</div> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
