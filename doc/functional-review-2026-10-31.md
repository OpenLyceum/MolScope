# MolScope functional review — 2026-10-31

Reviewed commit: `bd81754721025c44d70c3a9aa19c9c5f98ffcf91` on `main`.

Scope: all three screens, library loading/rendering, supported file parsing, per-atom display
and selection, measurement updates, script execution, asynchronous load/reset behavior, crystal
packing, keyboard picking, basic localization and the existing validation gates. This is a
record of the original review, when application sources were not modified and no commits or
pushes were made. The subsequent authorized fixes are recorded under Resolution below.

## Findings

### 1. [P2] Different molecules with the same atom count become chemically incorrect frames

Location: `src/common/model/parsers/parseMol.ts:64–71`; the same atom-count-only assumption is
also present in `src/common/model/parsers/parseXyz.ts:57–63`.

Reproduction: combine the bundled water and carbon-dioxide MOL records into one SDF, separated
by `$$$$`, open it with the actual Open File control, and activate Next frame. The viewer accepts
two frames but keeps the first record's O/H/H atoms and its two single O–H bonds while displaying
the second record's O/O/C coordinates. The sidebar still reports H₂O. The second frame comment is
the CO₂ record's CID, `280`.

Cause: later records are accepted whenever their atom count matches; their element identities,
charges, connectivity and bond orders are discarded. Equal atom count does not establish that
records are conformers of the same molecule. Multi-compound SDF downloads are a normal PubChem
workflow: [PubChem structure downloads](https://pubchem.ncbi.nlm.nih.gov/docs/structures).

Impact: imported files can display a plausible-looking but chemically false structure, with
wrong elements, formula, bond topology and measurements. This is not a failure of the bundled
individual structures: the counterexample uses two independently valid bundled records.

Suggested correction: only aggregate compatible records as frames, validating atom ordering,
identity, formal charges and explicit topology. Otherwise keep the first structure with a clear
message, reject the unsupported multi-molecule file, or support separate molecules explicitly.
For XYZ trajectories, at least verify the element sequence. Add mixed-record and valid-conformer
regressions.

### 2. [P2] A superseded script resumes after Reset All and changes the reset molecule

Location: `src/common/model/ViewerModel.ts:298–299` (stale loads return success),
`src/common/model/ScriptEngine.ts:198–205` (continuation), and `ViewerModel.runScript/reset`.

Reproduction using the real script input and Reset All button:

1. Submit `load $water; color red; spin on` and delay the PubChem response in the browser.
2. Activate Reset All and let its default caffeine load finish. The console is empty, spin is
   false and the default element colours are present.
3. Fulfil the old request with valid water data.

Observed: the structure remains caffeine, but all its atoms become red, spin becomes true, and
a stale "Loaded water" message returns to the cleared console. The load token prevents the old
structure from replacing caffeine, but the old script receives a success result and executes
the remaining commands against the newer structure.

Suggested correction: cancel/invalidate the complete script operation on reset or superseding
loads, including later commands and output, rather than only suppressing structure assignment.
Distinguish cancellation from a successful load. Test delayed success and failure after reset,
and overlapping scripted and menu/file loads.

### 3. [P2] Crystal packing and the rendered cell outline can disagree

Location: `src/common/model/ViewerModel.ts:305–308,323–328` and
`src/common/view/MoleculeViewerNode.ts:100,120`.

Two independently reproduced paths:

- Run `load nacl {1 2 3}`. The structure contains 105 sites with maximum fractional coordinates
  `[1,2,3]`, but `cellRangeProperty` stores only `1` and the renderer receives `[1,1,1]`.
- On Crystals, choose the actual 3×3×3 radio control (343 NaCl sites), then use Open File to
  open the bundled NaCl CIF as a custom file. It is parsed as one cell (27 sites), but the radio
  selection remains 3×3×3 and the renderer still receives `[3,3,3]`.

Cause: loaded packing is a three-component range, but the model retains only its first component
for library loads and does not reset it at all for file imports. The canvas reconstructs a cube
from that scalar instead of retaining the structure's actual packing dimensions.

Impact: the unit-cell box misrepresents the displayed crystal and the controls can claim the
wrong number of cells. The two paths require consistent state ownership, not just a label fix.

Suggested correction: retain the full actual packing range with the loaded structure and use it
for rendering. Synchronize or explicitly distinguish the cubic preset controls for asymmetric
ranges; initialize custom CIF imports consistently. Test non-cubic scripts, custom-file imports
after changing the preset, and returning to a cubic preset.

### 4. [P2] Sidebar measurements and atom coordinates freeze during vibrations

Location: `src/common/view/StructureInfoPanel.ts:211–220`.

Reproduction: load Water — vibrational modes and measure H2–O1–H3 in Angle mode. In a controlled
phase check, the model/canvas value changes from 104.5202° at phase 0 to 103.7455° at 0.25 s,
while the sidebar continues to show 104.5°. A screenshot shows the canvas label at 103.7° and
the sidebar at 104.5° at the same time. The picked atom's sidebar coordinates also remain at
their earlier values.

Cause: `updatePicking` reads `currentPositions()` and `measurementValue()`, but its Multilink
does not include `vibrationTimeProperty` or `vibrationProperty`. Frame changes notify it;
motion within a vibrating frame does not. The canvas does observe vibration state.

Suggested correction: include the displayed-position dependencies when updating picking and
measurement readouts, including toggling vibration off. Add a browser regression comparing
the panel and canvas/model values at controlled phases and after disabling vibration.

### 5. [P2] Keyboard navigation can identify and measure hidden atoms

Location: `src/common/view/MoleculeViewerNode.ts:411–415,425–440`.

Reproduction: submit `load water; hide all; set picking distance`, focus the actual Molecule
viewer PDOM target, press N and then Enter. All three atoms have `hidden = 1`, yet the viewer
sets hovered/picked atom 2 and starts a distance measurement with `pendingPicks = [2]`.

Cause: when the cursor loop finds no displayed atom it still assigns its final candidate and
announces it. Enter/Space only checks that the cursor index is nonnegative, so a cursor whose
atom becomes hidden can also still be picked. The pointer renderer correctly excludes hidden
atoms, so keyboard behavior diverges from the displayed scene.

Suggested correction: leave/clear the cursor when no visible candidate exists and revalidate
visibility before keyboard picking. Test all-hidden structures and hiding an atom already
under the keyboard cursor, while preserving navigation through a partially visible structure.

### 6. [P2] Invalid coordinate files replace the good structure before reporting an error

Location: `src/common/model/parsers/parseXyz.ts:37–54` (unchecked numeric conversion),
`src/common/model/ViewerModel.ts:323–328,333–362` (installation before camera validation).

Reproduction: start with caffeine and use the actual Open File control to import:

```text
2
invalid coordinates
H nope 0 0
H 0 0 1
```

Observed on the normal startup URL: the load reports an error containing a NumberProperty NaN
assertion, but `structure.title` has already changed to `invalid coordinates`, the installed
positions contain NaN and `radiusProperty` is nonfinite. The working caffeine structure was
not preserved. The parser checked the row's field count but accepted a nonnumeric coordinate.

Suggested correction: validate all positions and optional vibration vectors as finite numbers
before returning a parsed structure, with a localizable parse error. Ensure failed installation
does not partially replace the active structure/camera. Apply the numeric invariant to the
other parsers too; add malformed-file regressions that preserve an already loaded valid model.

## Validation

- Runtime: WSL distribution registered as Ubuntu-24.04, Node v26.13.0.
- `npm run lint`: passes with 23 existing warnings (predominantly cognitive complexity); no fixes
  applied.
- `npm run check`: passes for app, scripts and tests.
- `npm test`: 46 tests pass across 5 files, including the existing 10 memory-leak cases.
- `npm run build`: passes, including PWA generation and structure chunks.
- `FUZZ_PORT=5191 npm run test:fuzz:quick`: pointer and keyboard pass, 10 seconds per mode.
- `Baton/scripts/check-repo-compliance.sh MolScope`: passes, including remote security settings.
- `Baton/scripts/check-template-drift.sh MolScope`: passes.
- Browser library smoke: all 59 entries (39 molecules, 8 biomolecules, 12 crystals) loaded and
  rendered on their own screen; current-frame coordinates were finite and bond endpoints were
  in range. This is structural smoke evidence, not a full scientific audit of every dataset.
- English screenshots for all three screens plus French/Spanish Biomolecules screenshots were
  inspected. This is localization smoke coverage, not a complete string-stress audit.
- Deterministic Chromium probes used the real console, Reset All, file chooser, frame button,
  crystal preset and viewer keyboard target. Delayed remote data was supplied by a controlled
  browser response; the remote service's current availability/CORS was not assessed.

Limitations: short fuzz does not validate semantic correctness. Manual screen-reader and
educator sign-off, exhaustive parser specification conformance, and sustained performance
profiling were outside this review. The documented approximate painter's renderer, coarse
secondary-structure fallback and permissive hydrogen-bond model are intentional limitations,
not findings here.

## Resolution — 2026-10-31

All six findings were addressed following the user's request to fix, commit and push:

1. MOL/SDF frames must have matching ordered atom identities, formal charges and canonical bond
   graphs. XYZ frames must share the element sequence. Incompatible records are rejected with a
   translated explanation instead of being shown with the first molecule's chemistry.
2. Script generations guard both continuation and console output. Reset, newer scripts and
   file/menu loads supersede older runs; stale load responses are cancellation, not success.
   Tests cover late success and late failure after each kind of newer action.
3. `Structure.cellRange` retains the full packing vector used by the renderer. Non-preset ranges
   have an explicit Custom radio choice. Custom CIF imports start at 1×1×1, retain their source,
   and can be repacked through the cubic presets.
4. The sidebar now observes vibration time and enable state, keeping measurements and atom
   coordinates consistent with the canvas, including when vibration is disabled.
5. An all-hidden structure leaves the keyboard cursor empty. Enter/Space revalidates visibility
   before picking, so a hidden old cursor cannot be used for a new measurement.
6. All parsers reject missing/nonfinite coordinates and vibration values before installation.
   Structure construction and direct model installation validate frame lengths and finiteness
   too. Failed imports preserve the current structure, display state and camera. The new parse
   errors are translated in English, French and Spanish.

Validation on Node v26.13.0:

- 69 unit tests across 6 files pass, including 21 new model regressions and the extended
  crystal-control disposal cases. The initial regression run failed 20 checks on the old code.
- 7 deterministic browser tests pass: live measurement/coordinate updates, hidden keyboard
  picking, real console plus Reset All with delayed data, actual cell controls and file imports,
  and rejected mixed/invalid imports with translated errors in all three locales.
- All 59 bundled structures still load and render with finite coordinates and valid bond indices.
- Pointer and keyboard fuzz pass (10 seconds each, `FUZZ_PORT=5193`).
- Lint passes with the same 23 pre-existing warnings; app/scripts/tests type checks,
  production/PWA build, compliance and template drift pass.
- Final screenshots confirm a selected Custom 1×2×3 packing with its matching outline, and the
  canvas and sidebar both showing the vibrating water angle as 103.7°.
