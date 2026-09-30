import { useEffect, useState } from "react";
import { getAsset } from "./repo";

interface Entry {
  url: string | null;
  refs: number;
  promise: Promise<string | null>;
}

const cache = new Map<string, Entry>();

/** Returns a ref-counted object URL; null when the asset is missing. */
function acquire(id: string): Entry {
  let e = cache.get(id);
  if (!e) {
    const entry: Entry = {
      url: null,
      refs: 0,
      promise: getAsset(id).then((a) => {
        if (!a) {
          return null;
        }
        entry.url = URL.createObjectURL(a.blob);
        return entry.url;
      }),
    };
    e = entry;
    cache.set(id, e);
  }
  e.refs++;
  return e;
}

function release(id: string) {
  const e = cache.get(id);
  if (!e) {
    return;
  }
  e.refs--;
  if (e.refs <= 0) {
    // Delay so quick remounts (e.g. page flips) reuse the decoded URL.
    setTimeout(() => {
      const cur = cache.get(id);
      if (cur && cur.refs <= 0) {
        if (cur.url) {
          URL.revokeObjectURL(cur.url);
        }
        cache.delete(id);
      }
    }, 4000);
  }
}

export type AssetUrlState = { url: string | null; missing: boolean };

export function useAssetUrl(id: string | null | undefined): AssetUrlState {
  const [state, setState] = useState<AssetUrlState>({ url: null, missing: false });
  useEffect(() => {
    if (!id) {
      setState({ url: null, missing: false });
      return;
    }
    let alive = true;
    const e = acquire(id);
    if (e.url) {
      setState({ url: e.url, missing: false });
    } else {
      e.promise
        .then((url) => {
          if (alive) {
            setState({ url, missing: url === null });
          }
        })
        .catch(() => {
          if (alive) {
            setState({ url: null, missing: true });
          }
        });
    }
    return () => {
      alive = false;
      release(id);
    };
  }, [id]);
  return state;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't decode the image."));
    img.src = src;
  });
}

export async function loadAssetImage(id: string): Promise<HTMLImageElement> {
  const a = await getAsset(id);
  if (!a) {
    throw new Error("Missing asset.");
  }
  const url = URL.createObjectURL(a.blob);
  try {
    return await loadImage(url);
  } finally {
    // Decoded image data stays valid after revoking in all modern engines
    // once onload has fired.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image."))),
      type,
      quality,
    );
  });
}
