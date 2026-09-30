import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "@remix-run/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import appCss from "./styles/app.css?url";
import { MotionProvider } from "./packages/shell/motion";
import { ToastProvider } from "./packages/shell/toast";

export const links = () => [
  { rel: "stylesheet", href: appCss },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/icon.svg" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <title>Paper Collage Diary</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function useServiceWorker() {
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline cache is an enhancement; the app works without it.
      });
    }
  }, []);
}

export default function App() {
  useServiceWorker();
  return (
    <MotionProvider>
      <ToastProvider>
        <div className="app-frame">
          <Outlet />
        </div>
      </ToastProvider>
    </MotionProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="app-frame">
      <div className="boot">Paper Collage Diary · Loading…</div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const msg = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";
  return (
    <div className="app-frame">
      <div className="boot">
        <p>Something went wrong: {msg}</p>
        <p>
          <a href="/">Back to bookshelf</a>
        </p>
      </div>
    </div>
  );
}
