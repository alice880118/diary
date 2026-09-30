import { useState } from "react";
import { NotebookForm, type NotebookFormValue } from "./NotebookForm";

const SLIDES = [
  {
    title: "Flip pages like a real diary",
    body: "Type, handwrite, doodle, and add images and links. Keep separate notebooks and look back month by month.",
    emoji: "📔",
  },
  {
    title: "Make your own paper stickers",
    body: "Draw or import a photo, pick from 30 paper textures, print in up to four risograph colors, and finish as clear, holographic, or white stickers.",
    emoji: "✂️",
  },
  {
    title: "Your data stays on this device",
    body: "No account needed and nothing is uploaded. Clearing browser data removes your content, so remember to export a backup in Settings.",
    emoji: "🔒",
  },
];

export function Onboarding({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (v: NotebookFormValue) => void;
}) {
  const [step, setStep] = useState(0);
  const isForm = step >= SLIDES.length;

  return (
    <div className="pad" style={{ paddingTop: 28 }}>
      {!isForm ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 72, margin: "24px 0 12px" }}>{SLIDES[step].emoji}</div>
          <h2 style={{ margin: "0 0 10px" }}>{SLIDES[step].title}</h2>
          <p className="muted" style={{ lineHeight: 1.7, fontSize: 15 }}>
            {SLIDES[step].body}
          </p>
          <div className="row" style={{ justifyContent: "center", margin: "18px 0 28px" }}>
            {SLIDES.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  background: i === step ? "var(--primary)" : "var(--border)",
                  transition: "width .2s",
                }}
              />
            ))}
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(SLIDES.length)}>
              Skip
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
              {step === SLIDES.length - 1 ? "Create first notebook" : "Next"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 style={{ margin: "0 0 4px" }}>Create your first notebook</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Pick a name, cover, and default page style. You can change them later.
          </p>
          <NotebookForm submitText="Create notebook" busy={busy} onSubmit={onCreate} />
        </>
      )}
    </div>
  );
}
