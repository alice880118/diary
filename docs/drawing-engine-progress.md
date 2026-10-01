# Brush / Drawing engine — progress log

Branch: `claude/vigilant-davinci-0m706h`. Spec: the "Brush / Drawing Tool" request (sections 1–35).

## Done (in this push)

- Data model (`app/packages/db/types.ts`): optional `seed`, `pressure`, `texture`, `shape`
  (ShapeGeom), `fill` (FillStyle: none | solid, extensible), `outline` on `Stroke`;
  new brushes crayon / pastel / chalk / dryBrush; `SCHEMA_VERSION` 3. Shapes also store
  outline `points` so older app versions still draw them. No migration, no read-time writes.
- Pure modules with tests (`npm test`, Node built-in runner, no new dependency):
  - `drawing/geometry.ts` — 11 shapes + arc → outlines, box resize/rotate, hit testing
  - `drawing/stabilizer.ts` — Off / Medium / Strong, velocity aware
  - `drawing/smoothing.ts` — Auto Smooth Off / Low / Medium / High, endpoints pinned
  - `drawing/recognition.ts` — line / arc / circle / ellipse with confidence threshold
- `drawing/brush.ts` — brush renderers; textured brushes are seeded stamping + tip masks
  + surface-anchored paper grain. Pen / marker / pencil output unchanged for old strokes.
- `drawing/session.ts` — StrokeSession state machine (drawing → holding → recognized →
  adjusting → committed): stabilizer, 1 s hold with 8 px tolerance, progress ring,
  150 ms morph, live adjustment after recognition; ShapeDrag for the Shape tool.
- `drawing/TransformBox.tsx` — 4 corner handles + rotate handle, 44 px touch targets.
- Studio Sketch: new toolbar Brush / Eraser / Shape / Select | Color / Size (Fill in shape
  context) / Layers; Brush Settings sheet (type, size, opacity, texture, stabilizer,
  auto smooth, hold-to-perfect); Size popover; Shape picker; Fill & stroke popover;
  select / move / resize / rotate / duplicate / delete; style edits apply to selection.
- Undo: Auto Smooth and Hold-to-Perfect are separate history steps (Undo → raw freehand).
- Page handwriting uses the same engine + toolbar (brush / eraser / select).
- Note handwriting: size slider; Print mask brush: visible Size button.
- Fixed: Stencil toggle collapsed into a dot.

## Verified

typecheck, build, 9 unit tests; browser E2E (mouse + simulated touch): crayon look,
hold → line / ellipse / arc, doodle stays freehand, Undo/Redo of corrections, shape
create + fill + resize / rotate / move / duplicate, sticker finish still saves.

## Next

1. Shape tool on page handwriting (EditorCanvas): reuse ShapeDrag + TransformBox, select
   shapes / strokes with handles (currently page select = rect-select + move only).
2. Fine-tune crayon edges against the reference (crisper broken edge).
3. Real-device check: Apple Pencil pressure, iPad hold tolerance.
4. Optional: per-stroke render cache if many textured strokes get slow.
