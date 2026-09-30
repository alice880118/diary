import { Link, useLocation } from "@remix-run/react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

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
      <Link to={to} className="icon-btn" aria-label="Back">
        <Icon name="back" />
      </Link>
    );
  }
  return (
    <button type="button" className="icon-btn" aria-label="Back" onClick={onClick}>
      <Icon name="back" />
    </button>
  );
}

export function SettingsLink() {
  return (
    <Link to="/settings" className="icon-btn" aria-label="Settings">
      <Icon name="gear" />
    </Link>
  );
}

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/diary", label: "Diary", icon: "book" },
  { to: "/create", label: "Create", icon: "brush" },
  { to: "/assets", label: "Library", icon: "sticker" },
];

export function BottomNav() {
  const loc = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
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
            <span>{n.label}</span>
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
