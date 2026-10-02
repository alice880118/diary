import type { CSSProperties } from "react";

export interface Cover {
  id: string;
  label: string;
  style: CSSProperties;
  ink: string;
  /** Illustrated cover (spine and title area drawn in); the name goes in its blank panel. */
  image?: string;
}

/**
 * The original paper covers. No longer offered for new notebooks, but kept so
 * existing notebooks render unchanged.
 */
const LEGACY_COVERS: Cover[] = [
  {
    id: "kraft",
    label: "Kraft",
    ink: "#4a3520",
    style: {
      background:
        "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18), transparent 40%), #c9a57a",
    },
  },
  {
    id: "tomato",
    label: "Tomato",
    ink: "#fff6ee",
    style: {
      background:
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 6px), #cf5a43",
    },
  },
  {
    id: "navy-dot",
    label: "Navy dots",
    ink: "#f5efe3",
    style: {
      backgroundColor: "#2f4570",
      backgroundImage: "radial-gradient(rgba(255,255,255,0.35) 2px, transparent 2.5px)",
      backgroundSize: "18px 18px",
    },
  },
  {
    id: "sage",
    label: "Sage",
    ink: "#23372a",
    style: {
      background: "linear-gradient(160deg, #a9c3a5, #8fae8f)",
    },
  },
  {
    id: "mustard-grid",
    label: "Mustard grid",
    ink: "#3b2f12",
    style: {
      backgroundColor: "#e0b64b",
      backgroundImage:
        "linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)",
      backgroundSize: "14px 14px",
    },
  },
  {
    id: "rose",
    label: "Rose",
    ink: "#5a2331",
    style: {
      background: "linear-gradient(145deg, #f3c1c9, #e59aa8)",
    },
  },
  {
    id: "charcoal",
    label: "Charcoal",
    ink: "#f1ebe1",
    style: {
      background:
        "radial-gradient(circle at 70% 20%, rgba(255,255,255,0.08), transparent 45%), #3d3a37",
    },
  },
  {
    id: "stripe",
    label: "Stripes",
    ink: "#2f2a25",
    style: {
      background:
        "repeating-linear-gradient(135deg, #f5ecdc 0 14px, #9cc1d8 14px 22px, #f5ecdc 22px 36px, #e9927f 36px 42px)",
    },
  },
];

/** Illustrated covers in public/covers, named 01, 02, ... */
const IMAGE_COVER_COUNT = 5;

export const COVERS: Cover[] = Array.from({ length: IMAGE_COVER_COUNT }, (_, i) => {
  const id = String(i + 1).padStart(2, "0");
  return {
    id,
    label: id,
    ink: "#2b2723",
    image: `/covers/${id}.webp`,
    style: { backgroundImage: `url(/covers/${id}.webp)`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#f3f1ec" },
  };
});

export function coverOf(id: string): Cover {
  return COVERS.find((c) => c.id === id) ?? LEGACY_COVERS.find((c) => c.id === id) ?? COVERS[0];
}
