# MolScope — implementation notes

## Layers

```
src/common/model/   pure data + algorithms (parsers, bonding, selection, scripts, geometry)
  ViewerModel.ts    the only reactive (axon) class; implements ScriptTarget
src/common/view/    renderer, viewer node, panels, console, shared screen view
src/<screen>/       thin subclasses choosing a library and menus
```

`ViewerModel` is the single entry point for every user action. The control panel, the mouse
modes, the keyboard cursor and `ScriptEngine` all call its methods, so there is one code path per
operation. `ScriptEngine` never formats text: it returns `ScriptMessage { key, args, isError }`
and `formatters.formatScriptMessage` localises it.

## Rendering

`MoleculeRenderer` is a painter's-algorithm renderer on a 2D canvas, close to how Jmol's own
software renderer works:

1. **Project.** Rotate each atom about the rotation centre (`Rotation3`, row-major, composed on
   the left so drags turn about screen axes), apply perspective f = D / (D − z) with D = 3 × the
   bounding radius (Jmol's `cameraDepth`), scale so the bounding sphere fits the viewport at zoom 1.
2. **Build primitives** into a pooled item list, each tagged with view-space depth: spheres,
   bond halves (split at the midpoint when the end colours differ; multiple bonds offset
   perpendicular in screen space; trimmed to start at the sphere surface), ribbon quads, tubes,
   polyhedron faces, dashed hydrogen bonds.
3. **Sort** back to front and paint. Spheres are `drawImage` of a radial-gradient sprite cached
   per colour (flushed past 512 colours, for continuous schemes). Cylinders are three concentric
   strokes (rim, body, highlight). Ribbons are flat quads shaded by |n·z|.
4. **Overlays** on top: halos, pick rings, labels, measurements, unit cell, axis gizmo.

Hemoglobin (4,779 atoms) holds ~50–60 fps while spinning in every style in headless Chromium.
The painter's algorithm is approximate where large primitives interpenetrate (a long bond through
a big sphere); Jmol's z-buffer is exact. The trims at sphere surfaces hide most of it.

The last projection is kept for picking (`pick(x, y)` returns the front-most atom whose disc
contains the point, with a 6 px minimum so wireframe atoms stay clickable).

### Cartoons

`CartoonGeometry.buildPolymerPaths` runs once per structure and frame. Consecutive residues with
a lead atom (Cα, or P/C4′ for nucleotides) form runs, broken at chain changes and gaps (> 4.5 Å
Cα–Cα, > 8.5 Å P–P). Each run gets a Catmull–Rom spline with 6 samples per residue. The guide
vector is Cα→O orthogonalised against the tangent and sign-aligned with its predecessor, which is
what makes sheets flat instead of pleated. Interval *k* takes the secondary structure of residue
*k*: helix half-width 1.25 Å, sheet 1.1 Å tapering from 1.8 Å to a point over a strand's last
residue, otherwise a 0.3 Å tube. Nucleic acids draw a tube plus a rung to N1 (purines) / N3
(pyrimidines).

## Input

`MoleculeViewerNode` uses a raw scenery input listener rather than `DragListener` because it needs
modifiers at press time and click-versus-drag detection (4 px slop). During a press it attaches a
listener to the pointer and **always** detaches it on release, cancel and interrupt — touch
pointers are disposed after those events, and scenery asserts if listeners remain (the fuzz test
catches this).

The structure combo box would outgrow the 618 px layout with 39 molecules, so the library is split
into collections: one combo per collection, only one visible, each with its own `Property` whose
value is always one of its items (`custom` when the structure came from elsewhere).

## Script console

The text field is a real `<input>` in a scenery `DOM` node (`allowInput: true`), so typing, paste,
IME and screen readers behave natively. Key events stop propagating so the sim's global hotkeys
don't fire while typing. Up/down walk a 50-command history.

## Data loading

Library files are imported with `import.meta.glob("./data/*", { query: "?raw" })`, so Vite emits
one lazily loaded chunk per file and Workbox precaches them for offline use; the single-file build
inlines them. Remote loads go through `RemoteSources.fetchText`, replaceable via
`ViewerModelOptions.fetchText` for tests. A load token discards stale results when loads overlap.

## Disposal

Panels dispose their own content after `super.dispose()` with `disposeSubtree` — see the leak
gotcha in `AGENTS.md`. Screen views live for the whole sim and are not disposed.
