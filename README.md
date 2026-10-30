# MolScope

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)

A browser molecular viewer in the spirit of [Jmol](https://jmol.sourceforge.net/): explore small
molecules, proteins, DNA and crystals in 3D, measure bond lengths and angles, and drive the view
with Jmol-style scripts. Built with [SceneryStack](https://scenerystack.org/), it runs offline as a
Progressive Web App.

## Features

- **Three screens.** *Molecules* (39 structures in five collections, including VSEPR shapes,
  vibrational modes of H₂O and CO₂, and an ethane torsion scan), *Biomolecules* (crambin,
  ubiquitin, insulin, GFP, trypsin–inhibitor, two hemoglobins, B-DNA) and *Crystals* (rock salt,
  CsCl, diamond, graphite, quartz, rutile, fluorite, zinc blende, wurtzite, perovskite, Cu, Fe).
- **Open your own files:** PDB, MOL/SDF, XYZ (including trajectories and vibration vectors) and
  CIF with full symmetry expansion, from a dialog or by drag-and-drop.
- **Fetch from databases** like Jmol: `load $aspirin` (PubChem 3D) and `load =1hho` (RCSB PDB).
- **Rendering styles:** wireframe, sticks, ball & stick, space-filling, cartoon (helices,
  arrowed β-strands, nucleic-acid ladders), trace and backbone — mixable per atom.
- **Colour schemes:** element (CPK), chain, secondary structure, B-factor, residue type,
  N→C rainbow and formal charge; multiple bonds from MOL files are drawn.
- **Mouse modes:** rotate, identify, distance, angle, torsion, select and centre; hover tooltips;
  measurement list; select all / none and apply the current style to the selection.
- **Script console** with a Jmol-compatible subset: `select`, `restrict`, `display`/`hide`,
  `spacefill`, `wireframe`, `cartoon`, `color`, `label`, `measure`, `spin`, `rotate`, `zoom`,
  `center`, `hbonds`, `unitcell`, `polyhedra`, `frame`, `animation`, `vibration`, `set`, and the
  atom-expression language (`protein and not water`, `[HEM]`, `10-20:A.CA`, `within(5, ligand)`).
- **Crystals:** packed 1×1×1 to 3×3×3 cells, unit-cell box, coordination polyhedra.
- **Accessible:** full keyboard operation (including stepping through atoms to measure),
  live screen summaries, projector colour profile, English / French / Spanish.

## Quick Start

```bash
npm install
npm start        # dev server → http://localhost:5173
```

Then open a screen, drag to rotate, scroll to zoom, and try `select ligand; spacefill on` in the
script box on the Biomolecules screen.

## Scripts

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run build:single` | Single self-contained `dist/index.html` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Vitest unit tests (parsers, selection language, script engine, memory leaks) |
| `npm run test:fuzz` / `:quick` / `:long` | Playwright fuzz smoke, pointer + keyboard (30 s / 10 s / 300 s) |
| `npm run check` | TypeScript type check |
| `npm run lint` | Biome lint check |
| `npm run format` | Auto-format all files |
| `npm run fix` | Lint + auto-fix |
| `npm run icons` | Regenerate PNG icons from `public/icons/icon.svg` |
| `npm run release` | `check && lint && build && test`, then version patch + push tags |
| `npm run clean` | Remove `dist/` |

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [SceneryStack](https://scenerystack.org/) | ^3.0.0 | Simulation framework |
| [Vite](https://vitejs.dev/) | ^8 | Build tool + dev server |
| [TypeScript](https://www.typescriptlang.org/) | ^7 | Type-safe JavaScript |
| [Biome](https://biomejs.dev/) | ^2.5 | Linting + formatting |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | ^2 | PWA + service worker |

Structure data comes from PubChem, the RCSB Protein Data Bank and the Crystallography Open
Database (all public domain); see [CREDITS.md](CREDITS.md).

## License

GNU Affero General Public License v3.0 — see [OpenLyceum org license](https://github.com/OpenLyceum/.github/blob/main/LICENSE).

## Contributing

See [OpenLyceum contributing guidelines](https://github.com/OpenLyceum/.github/blob/main/CONTRIBUTING.md).
Report bugs via GitHub Issues; use org issue templates.
