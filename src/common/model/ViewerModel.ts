/**
 * ViewerModel.ts
 *
 * The reactive heart of every MolScope screen: the loaded structure, its per-atom
 * {@link DisplayState}, the camera (rotation, zoom, centre), animation and vibration,
 * picking and measurements, and the script console. Each screen model extends it
 * with its own library and default rendering.
 *
 * It implements {@link ScriptTarget}, so the control panel and the Jmol-style script
 * console drive exactly the same operations.
 */

import { BooleanProperty, NumberProperty, Property, type TReadOnlyProperty } from "scenerystack/axon";
import type { TModel } from "scenerystack/joist";
import type { SelectionContext } from "./AtomSelection.js";
import type { ColorSchemeValue } from "./ColorSchemes.js";
import { ColorScheme } from "./ColorSchemes.js";
import type { DisplayStyleValue, LabelModeValue } from "./DisplayState.js";
import { DisplayState, DisplayStyle, LABEL_FORMATS, LabelMode } from "./DisplayState.js";
import type { Vec3 } from "./Geometry.js";
import { angle, dihedral, distance } from "./Geometry.js";
import { findHydrogenBonds } from "./HydrogenBonds.js";
import type { LibraryCategoryValue, LibraryEntry } from "./library/StructureLibrary.js";
import { findLibraryEntry, libraryEntries, libraryEntry, loadLibraryText } from "./library/StructureLibrary.js";
import type { Polyhedron } from "./Polyhedra.js";
import { findPolyhedra } from "./Polyhedra.js";
import { parseStructure } from "./parsers/parseStructure.js";
import { fetchText, isPdbId, pubChemUrl, rcsbUrl } from "./RemoteSources.js";
import { Rotation3 } from "./Rotation3.js";
import type { LoadRequest, PickingModeValue, ScriptMessage, ScriptTarget, ToggleOptionValue } from "./ScriptEngine.js";
import { PickingMode, ScriptEngine, ToggleOption } from "./ScriptEngine.js";
import type { Bond, Frame, Structure } from "./Structure.js";

/** Default spin rate, degrees per second (Jmol `spin on` uses 30). */
export const DEFAULT_SPIN_RATE = 30;

/** Frames per second for trajectory animation. */
export const ANIMATION_FPS = 10;

/** Vibration period, seconds of wall time per oscillation. */
export const VIBRATION_PERIOD = 1;

/** Zoom limits, multiples of the fitted view. */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 20;

/** Lines kept in the script-console history. */
export const MAX_CONSOLE_LINES = 200;

export type Measurement = {
  /** 2 atoms: distance; 3: angle; 4: dihedral. */
  readonly atoms: readonly number[];
};

export type ConsoleLine =
  | { readonly kind: "input"; readonly text: string }
  | { readonly kind: "message"; readonly message: ScriptMessage };

export const LoadState = {
  IDLE: "idle",
  LOADING: "loading",
  ERROR: "error",
} as const;
export type LoadStateValue = (typeof LoadState)[keyof typeof LoadState];

export type ViewerModelOptions = {
  readonly category: LibraryCategoryValue;
  readonly defaultEntryId: string;
  readonly defaultStyle: DisplayStyleValue;
  readonly defaultColorScheme: ColorSchemeValue;
  /** Show the unit cell when a crystal loads. */
  readonly showUnitCellOnLoad?: boolean;
  /** Preference the perspective toggle starts from and returns to on reset. */
  readonly perspectivePreferenceProperty?: TReadOnlyProperty<boolean>;
  /** Fetch hook (tests replace it). */
  readonly fetchText?: (url: string) => Promise<string>;
};

/** Library id meaning "a file the user opened or fetched". */
export const CUSTOM_ENTRY_ID = "custom";

export class ViewerModel implements TModel, ScriptTarget {
  public readonly entries: readonly LibraryEntry[];
  public readonly options: ViewerModelOptions;

  public readonly structureProperty = new Property<Structure | null>(null);
  /** Incremented after every edit to {@link displayState}; the view repaints on change. */
  public readonly displayRevisionProperty = new NumberProperty(0);
  public readonly entryIdProperty: Property<string>;
  public readonly loadStateProperty = new Property<LoadStateValue>(LoadState.IDLE);
  public readonly loadErrorProperty = new Property<string>("");

  // Camera
  public readonly rotationProperty = new Property<Rotation3>(Rotation3.IDENTITY);
  public readonly zoomProperty = new NumberProperty(1);
  /** Rotation centre, Å. */
  public readonly centerProperty = new Property<Vec3>([0, 0, 0]);
  /** Bounding radius about the centre, Å — the camera fits this sphere at zoom 1. */
  public readonly radiusProperty = new NumberProperty(5);
  public readonly perspectiveProperty = new BooleanProperty(true);
  public readonly spinProperty = new BooleanProperty(false);
  public readonly spinRateProperty = new NumberProperty(DEFAULT_SPIN_RATE);
  /** Script-set background colour (0xRRGGBB) overriding the colour profile, or null. */
  public readonly backgroundOverrideProperty = new Property<number | null>(null);

  // Rendering presets (what the menus last applied to the selection)
  public readonly styleProperty: Property<DisplayStyleValue>;
  public readonly colorSchemeProperty: Property<ColorSchemeValue>;
  public readonly labelModeProperty = new Property<LabelModeValue>(LabelMode.NONE);
  public readonly showHydrogensProperty = new BooleanProperty(true);
  public readonly selectionHalosProperty = new BooleanProperty(false);
  public readonly hydrogenBondsProperty = new BooleanProperty(false);
  public readonly unitCellProperty = new BooleanProperty(false);
  public readonly axesProperty = new BooleanProperty(false);
  public readonly polyhedraProperty = new BooleanProperty(false);
  /** Unit cells packed along each axis for crystals (1–3). */
  public readonly cellRangeProperty = new NumberProperty(1);

  // Frames and vibration
  public readonly frameIndexProperty = new NumberProperty(0);
  public readonly animatingProperty = new BooleanProperty(false);
  public readonly vibrationProperty = new BooleanProperty(false);
  /** Vibration phase clock, s. */
  public readonly vibrationTimeProperty = new NumberProperty(0);

  // Picking and measurement
  public readonly pickingModeProperty = new Property<PickingModeValue>(PickingMode.ROTATE);
  public readonly pickedAtomProperty = new Property<number | null>(null);
  public readonly hoveredAtomProperty = new Property<number | null>(null);
  public readonly pendingPicksProperty = new Property<readonly number[]>([]);
  public readonly measurementsProperty = new Property<readonly Measurement[]>([]);

  // Script console
  public readonly consoleLinesProperty = new Property<readonly ConsoleLine[]>([]);

  private state: DisplayState | null = null;
  private readonly scriptEngine: ScriptEngine;
  private readonly fetcher: (url: string) => Promise<string>;
  private loadToken = 0;
  private animationAccumulator = 0;
  private hydrogenBondCache: Bond[] | null = null;
  private polyhedraCache: Polyhedron[] | null = null;
  private vibratedPositions: Float64Array | null = null;
  /** Set while a load writes the cell range, so the range listener does not reload again. */
  private settingRange = false;

  public constructor(options: ViewerModelOptions) {
    this.options = options;
    this.entries = libraryEntries(options.category);
    this.entryIdProperty = new Property<string>(options.defaultEntryId);
    this.styleProperty = new Property<DisplayStyleValue>(options.defaultStyle);
    this.colorSchemeProperty = new Property<ColorSchemeValue>(options.defaultColorScheme);
    this.fetcher = options.fetchText ?? fetchText;
    this.scriptEngine = new ScriptEngine(this);
    options.perspectivePreferenceProperty?.link((perspective) => {
      this.perspectiveProperty.value = perspective;
    });

    this.showHydrogensProperty.lazyLink((show) => {
      this.applyHydrogenVisibility(show);
      this.displayChanged();
    });
    this.labelModeProperty.lazyLink((mode) => {
      this.state?.setLabel(LABEL_FORMATS[mode]);
      this.displayChanged();
    });
    this.pickingModeProperty.lazyLink(() => {
      this.pendingPicksProperty.value = [];
    });
    this.cellRangeProperty.lazyLink((range) => {
      const entry = libraryEntry(this.entryIdProperty.value);
      if (entry?.range && !this.settingRange) {
        this.load({ source: "library", id: entry.id, range: [range, range, range] }).catch(() => undefined);
      }
    });
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  public get displayState(): DisplayState | null {
    return this.state;
  }

  public get structure(): Structure | null {
    return this.structureProperty.value;
  }

  public get frameCount(): number {
    return this.structure?.frames.length ?? 0;
  }

  public get currentFrame(): Frame | null {
    const frames = this.structure?.frames;
    return frames?.[Math.min(this.frameIndexProperty.value, frames.length - 1)] ?? null;
  }

  /** True when the current frame carries vibration vectors. */
  public get hasVibrations(): boolean {
    return (this.currentFrame?.vibrations ?? null) !== null;
  }

  /** Positions to render this instant: the current frame, displaced along its vibration if animating. */
  public currentPositions(): Float64Array {
    const frame = this.currentFrame;
    if (!frame) {
      return new Float64Array(0);
    }
    if (!(this.vibrationProperty.value && frame.vibrations)) {
      return frame.positions;
    }
    const n = frame.positions.length;
    if (this.vibratedPositions?.length !== n) {
      this.vibratedPositions = new Float64Array(n);
    }
    const s = Math.sin((2 * Math.PI * this.vibrationTimeProperty.value) / VIBRATION_PERIOD);
    const out = this.vibratedPositions;
    for (let i = 0; i < n; i++) {
      out[i] = (frame.positions[i] ?? 0) + s * (frame.vibrations[i] ?? 0);
    }
    return out;
  }

  public hydrogenBonds(): readonly Bond[] {
    const structure = this.structure;
    const frame = this.currentFrame;
    if (!(structure && frame)) {
      return [];
    }
    this.hydrogenBondCache ??= findHydrogenBonds(structure, frame.positions);
    return this.hydrogenBondCache;
  }

  public polyhedra(): readonly Polyhedron[] {
    const structure = this.structure;
    const frame = this.currentFrame;
    if (!(structure && frame)) {
      return [];
    }
    this.polyhedraCache ??= findPolyhedra(structure, frame.positions);
    return this.polyhedraCache;
  }

  /** Value of a measurement in Å or degrees, from the positions being displayed. */
  public measurementValue(measurement: Measurement): number {
    const p = this.currentPositions();
    const v = measurement.atoms.map((i): Vec3 => [p[3 * i] ?? 0, p[3 * i + 1] ?? 0, p[3 * i + 2] ?? 0]);
    const [a, b, c, d] = v;
    if (a && b && c && d) {
      return dihedral(a, b, c, d);
    }
    if (a && b && c) {
      return angle(a, b, c);
    }
    return a && b ? distance(a, b) : 0;
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  /** Loads the selected library entry (the screen's combo box). */
  public loadEntry(id: string): Promise<{ title: string; atomCount: number }> {
    const entry = libraryEntry(id);
    const range = this.cellRangeProperty.value;
    return this.load({ source: "library", id, range: entry?.range ? [range, range, range] : [1, 1, 1] });
  }

  public async load(request: LoadRequest): Promise<{ title: string; atomCount: number }> {
    const token = ++this.loadToken;
    this.loadStateProperty.value = LoadState.LOADING;
    try {
      let text: string;
      let name: string;
      let range: Vec3 = [1, 1, 1];
      if (request.source === "library") {
        const entry = libraryEntry(request.id);
        if (!entry) {
          throw new Error(request.id);
        }
        text = await loadLibraryText(entry);
        name = entry.file;
        range = request.range;
      } else if (request.source === "pdb") {
        if (!isPdbId(request.id)) {
          throw new Error(request.id);
        }
        text = await this.fetcher(rcsbUrl(request.id));
        name = `${request.id}.pdb`;
      } else {
        text = await this.fetcher(pubChemUrl(request.name));
        name = `${request.name}.sdf`;
      }
      const title = request.source === "pubchem" ? request.name : request.source === "pdb" ? request.id : "";
      const structure = parseStructure(text, name, title, range);
      if (token !== this.loadToken) {
        return { title: structure.title, atomCount: structure.atoms.length };
      }
      this.entryIdProperty.value = request.source === "library" ? request.id : CUSTOM_ENTRY_ID;
      if (structure.unitCell && structure.format === "CIF") {
        this.settingRange = true;
        this.cellRangeProperty.value = range[0];
        this.settingRange = false;
      }
      this.setStructure(structure);
      this.loadStateProperty.value = LoadState.IDLE;
      return { title: structure.title, atomCount: structure.atoms.length };
    } catch (error) {
      if (token === this.loadToken) {
        this.loadStateProperty.value = LoadState.ERROR;
        this.loadErrorProperty.value = error instanceof Error ? error.message : String(error);
      }
      throw error;
    }
  }

  /** Loads text from a user-opened or dropped file. */
  public loadText(text: string, fileName: string): Structure {
    ++this.loadToken;
    const structure = parseStructure(text, fileName);
    this.entryIdProperty.value = CUSTOM_ENTRY_ID;
    this.setStructure(structure);
    this.loadStateProperty.value = LoadState.IDLE;
    return structure;
  }

  /** Installs a structure with this screen's default rendering. */
  public setStructure(structure: Structure): void {
    this.state = new DisplayState(structure);
    this.hydrogenBondCache = null;
    this.polyhedraCache = null;
    this.vibratedPositions = null;
    this.frameIndexProperty.value = 0;
    this.animatingProperty.value = false;
    this.vibrationProperty.value = structure.frames.some((f) => f.vibrations !== null);
    this.measurementsProperty.value = [];
    this.pendingPicksProperty.value = [];
    this.pickedAtomProperty.value = null;
    this.hoveredAtomProperty.value = null;

    const style = structure.isBiomolecule ? this.options.defaultStyle : this.smallMoleculeStyle();
    const scheme = structure.isBiomolecule ? this.options.defaultColorScheme : ColorScheme.ELEMENT;
    this.state.applyStyle(style);
    this.state.setColorScheme(scheme);
    this.state.setLabel(LABEL_FORMATS[this.labelModeProperty.value]);
    this.applyHydrogenVisibility(this.showHydrogensProperty.value);
    this.styleProperty.value = style;
    this.colorSchemeProperty.value = scheme;
    if (structure.unitCell && this.options.showUnitCellOnLoad) {
      this.unitCellProperty.value = true;
    }
    // Notify the structure before resetting the view, so views see the new atoms first.
    this.structureProperty.value = structure;
    this.resetView();
    this.displayChanged();
  }

  private smallMoleculeStyle(): DisplayStyleValue {
    const s = this.options.defaultStyle;
    return s === DisplayStyle.CARTOON || s === DisplayStyle.TRACE || s === DisplayStyle.BACKBONE
      ? DisplayStyle.BALL_AND_STICK
      : s;
  }

  private applyHydrogenVisibility(show: boolean): void {
    const state = this.state;
    if (!state) {
      return;
    }
    state.structure.atoms.forEach((atom, i) => {
      if (atom.element.number === 1) {
        state.hidden[i] = show ? 0 : 1;
      }
    });
  }

  // ── ScriptTarget ─────────────────────────────────────────────────────────────

  public selectionContext(): SelectionContext | null {
    const state = this.state;
    const frame = this.currentFrame;
    if (!(state && frame)) {
      return null;
    }
    return {
      structure: state.structure,
      frame,
      selected: state.selected,
      isDisplayed: (i) => state.isDisplayed(i),
    };
  }

  public setSpin(on: boolean, degreesPerSecond?: number): void {
    if (degreesPerSecond !== undefined) {
      this.spinRateProperty.value = degreesPerSecond;
    }
    this.spinProperty.value = on;
  }

  public rotate(axis: Vec3, degrees: number): void {
    this.rotationProperty.value = this.rotationProperty.value.rotatedAboutScreenAxis(axis, degrees);
  }

  public setZoomPercent(percent: number): void {
    this.zoomProperty.value = clampZoom(percent / 100);
  }

  public zoomBy(factor: number): void {
    this.zoomProperty.value = clampZoom(this.zoomProperty.value * factor);
  }

  /** Re-fits the camera: identity rotation, zoom 1, centred on the displayed atoms. */
  public resetView(): void {
    this.rotationProperty.value = Rotation3.IDENTITY;
    this.zoomProperty.value = 1;
    this.centerOn(null);
  }

  /** Centres rotation on the masked atoms (null: all atoms) and refits the radius. */
  public centerOn(mask: Uint8Array | null): void {
    const structure = this.structure;
    const p = this.currentFrame?.positions;
    if (!(structure && p) || structure.atoms.length === 0) {
      return;
    }
    const use = (i: number) => mask === null || mask[i] === 1;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let count = 0;
    for (let i = 0; i < structure.atoms.length; i++) {
      if (use(i)) {
        cx += p[3 * i] ?? 0;
        cy += p[3 * i + 1] ?? 0;
        cz += p[3 * i + 2] ?? 0;
        count++;
      }
    }
    if (count === 0) {
      return;
    }
    const center: Vec3 = [cx / count, cy / count, cz / count];
    if (mask === null) {
      // Fit the radius to everything (plus the cell, so crystals stay framed).
      let r = 0;
      for (let i = 0; i < structure.atoms.length; i++) {
        const d = Math.hypot(
          (p[3 * i] ?? 0) - center[0],
          (p[3 * i + 1] ?? 0) - center[1],
          (p[3 * i + 2] ?? 0) - center[2],
        );
        r = Math.max(r, d + (structure.atoms[i]?.element.vdwRadius ?? 1.5));
      }
      this.radiusProperty.value = Math.max(r, 2);
    }
    this.centerProperty.value = center;
  }

  public setBackground(color: number | null): void {
    this.backgroundOverrideProperty.value = color;
  }

  public addMeasurement(atoms: readonly number[]): number | null {
    if (atoms.length < 2 || atoms.length > 4 || new Set(atoms).size !== atoms.length) {
      return null;
    }
    const measurement = { atoms: [...atoms] };
    this.measurementsProperty.value = [...this.measurementsProperty.value, measurement];
    return this.measurementValue(measurement);
  }

  public clearMeasurements(): void {
    this.measurementsProperty.value = [];
    this.pendingPicksProperty.value = [];
  }

  public setToggle(option: ToggleOptionValue, on: boolean): void {
    const map: Record<ToggleOptionValue, BooleanProperty> = {
      [ToggleOption.HBONDS]: this.hydrogenBondsProperty,
      [ToggleOption.UNIT_CELL]: this.unitCellProperty,
      [ToggleOption.AXES]: this.axesProperty,
      [ToggleOption.POLYHEDRA]: this.polyhedraProperty,
      [ToggleOption.VIBRATION]: this.vibrationProperty,
      [ToggleOption.ANIMATION]: this.animatingProperty,
      [ToggleOption.PERSPECTIVE]: this.perspectiveProperty,
      [ToggleOption.HALOS]: this.selectionHalosProperty,
      [ToggleOption.HYDROGENS]: this.showHydrogensProperty,
    };
    map[option].value = on;
  }

  public setFrame(frame: number | "next" | "prev"): void {
    const count = this.frameCount;
    if (count === 0) {
      return;
    }
    const current = this.frameIndexProperty.value;
    const next = frame === "next" ? current + 1 : frame === "prev" ? current - 1 : frame;
    this.frameIndexProperty.value = ((next % count) + count) % count;
  }

  public setPickingMode(mode: PickingModeValue): void {
    this.pickingModeProperty.value = mode;
  }

  public setColorScheme(scheme: ColorSchemeValue): void {
    this.state?.setColorScheme(scheme);
    this.colorSchemeProperty.value = scheme;
    this.displayChanged();
  }

  public setStyle(style: DisplayStyleValue): void {
    this.state?.applyStyle(style);
    this.applyHydrogenVisibility(this.showHydrogensProperty.value);
    this.styleProperty.value = style;
    this.displayChanged();
  }

  public displayChanged(): void {
    this.displayRevisionProperty.value++;
  }

  public findLibraryEntry(name: string): string | null {
    const entry = findLibraryEntry(name) ?? (isPdbId(name) ? libraryEntry(name.toLowerCase()) : null);
    return entry ? entry.id : null;
  }

  // ── Console ──────────────────────────────────────────────────────────────────

  /** Runs a script typed in the console and records its input and output. */
  public async runScript(script: string): Promise<readonly ScriptMessage[]> {
    this.appendConsole([{ kind: "input", text: script }]);
    const messages = await this.scriptEngine.run(script);
    this.appendConsole(messages.map((message) => ({ kind: "message", message })));
    return messages;
  }

  public clearConsole(): void {
    this.consoleLinesProperty.value = [];
  }

  private appendConsole(lines: readonly ConsoleLine[]): void {
    if (lines.length > 0) {
      this.consoleLinesProperty.value = [...this.consoleLinesProperty.value, ...lines].slice(-MAX_CONSOLE_LINES);
    }
  }

  // ── Picking ──────────────────────────────────────────────────────────────────

  /** Handles a click on an atom according to the picking mode. */
  public pickAtom(index: number): void {
    const state = this.state;
    if (!state) {
      return;
    }
    switch (this.pickingModeProperty.value) {
      case PickingMode.DISTANCE:
      case PickingMode.ANGLE:
      case PickingMode.TORSION: {
        const needed = { distance: 2, angle: 3, torsion: 4 }[this.pickingModeProperty.value as "distance"];
        const picks = [...this.pendingPicksProperty.value];
        if (picks[picks.length - 1] === index) {
          return;
        }
        picks.push(index);
        if (picks.length >= needed) {
          this.addMeasurement(picks);
          this.pendingPicksProperty.value = [];
        } else {
          this.pendingPicksProperty.value = picks;
        }
        this.pickedAtomProperty.value = index;
        break;
      }
      case PickingMode.SELECT:
        state.selected[index] = state.selected[index] ? 0 : 1;
        this.selectionHalosProperty.value = true;
        this.displayChanged();
        break;
      case PickingMode.CENTER: {
        const mask = new Uint8Array(state.atomCount);
        mask[index] = 1;
        this.centerOn(mask);
        this.pickedAtomProperty.value = index;
        break;
      }
      default:
        this.pickedAtomProperty.value = index;
        break;
    }
  }

  // ── Time ─────────────────────────────────────────────────────────────────────

  public step(dt: number): void {
    if (this.spinProperty.value) {
      this.rotate([0, 1, 0], this.spinRateProperty.value * dt);
    }
    if (this.animatingProperty.value && this.frameCount > 1) {
      this.animationAccumulator += dt;
      const period = 1 / ANIMATION_FPS;
      while (this.animationAccumulator >= period) {
        this.animationAccumulator -= period;
        this.setFrame("next");
      }
    }
    if (this.vibrationProperty.value && this.hasVibrations) {
      this.vibrationTimeProperty.value = (this.vibrationTimeProperty.value + dt) % VIBRATION_PERIOD;
    }
  }

  public reset(): void {
    this.labelModeProperty.reset();
    this.showHydrogensProperty.reset();
    this.selectionHalosProperty.reset();
    this.hydrogenBondsProperty.reset();
    this.unitCellProperty.reset();
    this.axesProperty.reset();
    this.polyhedraProperty.reset();
    this.perspectiveProperty.value = this.options.perspectivePreferenceProperty?.value ?? true;
    this.spinProperty.reset();
    this.spinRateProperty.reset();
    this.backgroundOverrideProperty.reset();
    this.pickingModeProperty.reset();
    this.vibrationTimeProperty.reset();
    this.clearConsole();
    this.loadErrorProperty.reset();
    // Resetting the cell range reloads crystals by itself; load the default entry otherwise.
    const rangeChanged = this.cellRangeProperty.value !== 1;
    this.cellRangeProperty.reset();
    if (!rangeChanged || this.entryIdProperty.value !== this.options.defaultEntryId) {
      this.loadEntry(this.options.defaultEntryId).catch(() => undefined);
    }
  }
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
