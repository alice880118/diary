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
import { installRangeFill } from "./packages/shell/rangeFill";
import { ToastProvider } from "./packages/shell/toast";

installRangeFill();

export const links = () => [
  { rel: "stylesheet", href: appCss },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
  { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
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
        <meta name="apple-mobile-web-app-title" content="Collage Diary" />
        <meta name="description" content="A paper collage diary: write, draw and stick your own stickers. Everything stays on your device." />
        <meta property="og:title" content="Paper Collage Diary" />
        <meta property="og:description" content="Write, draw and stick your own stickers. Everything stays on your device." />
        <meta property="og:image" content="/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="/og-image.jpg" />
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
