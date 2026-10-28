# AGENTS.md — MolScope

Sim-specific context for AI assistants. General SceneryStack guidance: [OpenLyceum/.github/AGENTS.md](https://github.com/OpenLyceum/.github/blob/main/AGENTS.md).

## Project

A browser molecular viewer in the spirit of [Jmol](https://jmol.sourceforge.net/): load small
molecules, proteins, nucleic acids and crystals, render them as wireframe, sticks, ball-and-stick,
space-filling, cartoon, trace or backbone, colour them by element, chain, secondary structure,
B-factor or residue, label and measure atoms, and drive everything from a Jmol-style script
console. Three screens share one viewer and differ only in their library and default menus:

| Screen | Library | Default rendering |
|---|---|---|
| Molecules | 39 PubChem / generated small molecules in 5 collections, incl. vibrations and a torsion scan | Ball & stick, CPK |
| Biomolecules | 8 PDB entries (crambin … hemoglobin, B-DNA) | Cartoon + ligands, secondary structure |
| Crystals | 12 COD crystals (rock salt … perovskite), packed into 1–3 cells | Ball & stick + unit cell |

Physics/chemistry and the script language: [`doc/model.md`](doc/model.md). Architecture and the
renderer: [`doc/implementation-notes.md`](doc/implementation-notes.md).

### The one thing to understand first

**Display state is per atom, and every command edits the current selection — exactly as in
Jmol.** `DisplayState` holds typed arrays (sphere radius, bond radius, colour, label, cartoon /
trace / backbone flags, hidden, selected). The menus, mouse modes and the script console all call
the same `ViewerModel` operations, which edit those arrays for the selected atoms and bump
`displayRevisionProperty`; the canvas repaints on that. A menu value (`styleProperty`,
`colorSchemeProperty`) is only "what was last applied", not the truth — scripts can mix styles.

## Key files

| File | Purpose |
|---|---|
| `src/MolScopeColors.ts` | Profile colours for chrome and viewer overlays (labels, measurements, cell, halos, console) |
| `src/MolScopeConstants.ts` | Layout constants |
| `src/i18n/StringManager.ts` | Localised strings: controls, styles, schemes, hints, script messages, library names |
| **Pure model** (`src/common/model/`) | **no Scenery imports except `ViewerModel` (axon only); unit-tested** |
| `Elements.ts` | Element table: Jmol CPK colours, covalent/vdW radii, masses, electronegativities |
| `Structure.ts` / `StructureBuilder.ts` | Atom/bond/residue/frame types; residue grouping, secondary structure, bond perception |
| `parsers/` | PDB, MOL/SDF (V2000), XYZ (+ vibration vectors, trajectories), CIF (symmetry + packing) |
| `BondPerception.ts` | Spatial-hash autobonding (covalent radii + 0.45 Å; crystal mode skips like-ion / cation–cation pairs) |
| `UnitCell.ts` | Cell matrix, symmetry-operator parser, `packCell` (Jmol `load … {n n n}`) |
| `AtomSelection.ts` | Jmol atom-expression compiler (`protein and not water`, `[HEM]`, `within(5, ligand)` …) |
| `DisplayState.ts` | Per-atom rendering arrays, style presets, label formats |
| `ColorSchemes.ts` | cpk, chain, structure, temperature, amino, group, formalCharge; colour-name parser |
| `ScriptEngine.ts` | The script interpreter; talks to a `ScriptTarget` and returns localisable `ScriptMessage`s |
| `CartoonGeometry.ts` | Catmull–Rom polymer paths, guide vectors, ribbon widths, strand arrowheads |
| `HydrogenBonds.ts` / `Polyhedra.ts` / `Composition.ts` / `Geometry.ts` / `Rotation3.ts` | H-bonds, coordination polyhedra, formula/mass, measurements, camera rotation |
| `library/StructureLibrary.ts` + `library/data/` | Built-in structures, lazily imported with `?raw` (one chunk each) |
| `ViewerModel.ts` | Property layer: structure, camera, toggles, frames/vibration, picking, measurements, console |
| **View** (`src/common/view/`) | |
| `MoleculeRenderer.ts` | Painter's-algorithm canvas renderer (sprites, cylinders, ribbons, faces, overlays, picking) |
| `MoleculeViewerNode.ts` | CanvasNode + pointer/wheel/keyboard input, hover tooltip |
| `ViewerControlPanel.ts` / `StructureInfoPanel.ts` / `ScriptConsoleNode.ts` | Right panel, left panel, console (DOM `<input>`) |
| `ViewerScreenView.ts` | Shared layout; screens pass a `ViewerScreenConfig` |
| `disposeSubtree.ts` | Disposes a panel's own nodes (Panel.dispose does not) — see Testing |
| `src/<screen>/` | Thin: model picks library + defaults, view picks menus, summary + keyboard help |

## Accessibility

- The viewer is a focusable `div`: arrows rotate, Shift+←/→ roll, +/= and − zoom, Home resets,
  **N/P walk a keyboard cursor through displayed atoms** (announced via `addAccessibleResponse`),
  Enter/Space picks it — so identify/measure/select/centre all work without a pointer.
  Keys live in `MolScopeHotkeyData.ts` and feed both the listener and the help dialog.
- Each screen summary has a **live** current-details paragraph (`createCurrentDetailsProperty`).
- `ControlFactory` builders take `accessibleName` as a required argument.
- `pdomOrder`: viewer → control panel → info panel → console → Reset All.

## Compliance carve-outs

- `vite.config.ts`: CSP `connect-src` adds `https://pubchem.ncbi.nlm.nih.gov` and
  `https://files.rcsb.org` so the dev/preview servers allow `load $name` and `load =pdbid`.
- **Data colours outside `MolScopeColors.ts`.** Atom and residue colours are scientific data,
  not theme: Jmol's CPK table in `Elements.ts` and the chain/structure/amino palettes and colour
  names in `ColorSchemes.ts` (script `color` arguments). `MolScopeScreenIcons.ts` reuses those
  data colours. All chrome and overlay colours are profile colours.
- **Script-console output is a RichText with inline `<span style="color:…">`**, built from profile
  colours at run time (no literal colours).
- **`src/common/model/library/data/`** holds third-party structure files (see `CREDITS.md`); they
  are not linted and must keep their original attribution.

### Template-owned files (drift-checked)

`Baton/scripts/check-template-drift.sh MolScope` compares template-owned infrastructure. The CSP
addition above is the only intended difference.

### `package.json` overrides

JSON cannot carry comments, so the rationale for forced transitive pins lives here. Prefer
**tilde (`~`) or exact** versions — caret (`^`) lets minors drift under what is meant to be a
hard pin. Dependabot ignores these three names (see `.github/dependabot.yml`) so it does not
open PRs that fight the overrides. Revisit when SceneryStack drops or re-pins them upstream.

| Override | Pin | Why |
|---|---|---|
| `lodash` | `~4.18.1` | SceneryStack declares `~4.17.12`. Bump clears Dependabot/npm advisories patched in 4.18.x (e.g. GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh). |
| `three` | `~0.125.2` | SceneryStack declares `^0.104.0`. Floor is 0.125.0 for GHSA-fq6p-x6j3-cmmq (ReDoS). Staying on the 0.125 line avoids a larger API jump; **0.125.x still has open CVEs** (e.g. XSS GHSA-7vvq-7r29-5vg3, fixed only in ≥0.137.0). Remove this override if/when SceneryStack stops depending on `three` or pins a patched line itself. |
| `brace-expansion` | `~5.0.12` | Transitive via `vite-plugin-pwa` / Workbox. Clears npm audit (originally GHSA-mh99-v99m-4gvg; keep ≥5.0.9 for GHSA-rgw5-rvv9-x895; ≥5.0.12 for the CPU-DoS advisory). |

## Testing

| Path | What it covers |
|---|---|
| `tests/common/parsers.test.ts` | All four parsers against the real library files (caffeine bond orders, crambin disulfides, 27-site rock salt, quartz packing, perovskite TiO₆ polyhedra) |
| `tests/common/selection.test.ts` | The atom-expression language on crambin |
| `tests/common/geometry.test.ts` | Distance/angle/dihedral signs, rotation drift, cell orthogonalisation, symmetry operators |
| `tests/common/script-engine.test.ts` | Script commands end to end on a `ViewerModel` (fetch stubbed), picking, vibration |
| `tests/memory-leak.test.ts` | Viewer node, both panels and the console are collected after dispose |

**Leak gotcha:** `Panel.dispose()` does not dispose its content, and a `Text` bound to a global
StringProperty keeps the panel alive through its bounds listener. Panels here dispose their own
content with `disposeSubtree(content)` *after* `super.dispose()`.

## Commands

```bash
npm run lint && npm run check && npm test && npm run build && npm run test:fuzz:quick
```

`npm start` serves on http://localhost:5173. Useful query parameters: `?screens=2` (open one
screen), `?ea` (assertions), `?perspective=false` (orthographic start).

## Adding a structure to the library

1. Drop the file into `src/common/model/library/data/` (PDB: keep ATOM/HETATM/HELIX/SHEET/CRYST1/CONECT).
2. Add an entry in `STRUCTURE_LIBRARY` (`molecule`/`biomolecule`/`crystal` helper, with a group).
3. Add the display name under `library` in **all three** `strings_*.json` (key = `nameKey`).
4. Record the source in `CREDITS.md`.
