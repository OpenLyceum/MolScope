/**
 * ScriptEngine.ts
 *
 * Interprets the Jmol scripting commands MolScope supports. Commands are separated
 * by `;` or new lines, `#` starts a comment, and every display command acts on the
 * current selection, exactly as in Jmol:
 *
 *   load caffeine | load $aspirin (PubChem) | load =1crn (RCSB PDB) | load quartz {2 2 2}
 *   select <expr> | restrict <expr> | display <expr> | hide <expr>
 *   spacefill [on|off|<Å>|<n>%] | cpk | wireframe [on|off|<Å>] | style <name>
 *   cartoon|trace|backbone [on|off] | color [<scheme>|<colour>] | color background <colour>
 *   label [<format>|on|off] | measure <a> <b> [<c> [<d>]] | measure off
 *   spin [on|off|<°/s>] | rotate [x|y|z] <°> | zoom [<%>|in|out] | center [<expr>] | reset
 *   hbonds|unitcell|axes|polyhedra|vibration|animation [on|off]
 *   frame [<n>|next|prev] | set <perspective|halos|hydrogens|picking> <value> | echo <text> | help
 *
 * The engine knows nothing about Scenery: it drives a {@link ScriptTarget} and
 * reports {@link ScriptMessage}s whose text the view localises.
 */

import type { SelectionContext } from "./AtomSelection.js";
import { evaluateSelection, SelectionSyntaxError } from "./AtomSelection.js";
import type { ColorSchemeValue } from "./ColorSchemes.js";
import { COLOR_SCHEMES, parseColor } from "./ColorSchemes.js";
import type { DisplayState, DisplayStyleValue } from "./DisplayState.js";
import { DisplayStyle, WIREFRAME_LINE } from "./DisplayState.js";
import type { Vec3 } from "./Geometry.js";

export const ScriptMessageKey = {
  SELECTED: "selected",
  LOADED: "loaded",
  LOADING: "loading",
  MEASURED: "measured",
  ECHO: "echo",
  HELP: "help",
  UNKNOWN_COMMAND: "unknownCommand",
  BAD_SELECTION: "badSelection",
  BAD_ARGUMENT: "badArgument",
  NO_STRUCTURE: "noStructure",
  LOAD_FAILED: "loadFailed",
} as const;
export type ScriptMessageKeyValue = (typeof ScriptMessageKey)[keyof typeof ScriptMessageKey];

export type ScriptMessage = {
  readonly key: ScriptMessageKeyValue;
  readonly isError: boolean;
  /** Substitution values; the view decides the wording. */
  readonly args: Readonly<Record<string, string | number>>;
};

/** Superseded work is neither a successful load nor a user-facing script error. */
export class ScriptCancelledError extends Error {}

/** Where `load` should get its data from. */
export type LoadRequest =
  | { readonly source: "library"; readonly id: string; readonly range: Vec3 }
  | { readonly source: "pubchem"; readonly name: string }
  | { readonly source: "pdb"; readonly id: string };

export const ToggleOption = {
  HBONDS: "hbonds",
  UNIT_CELL: "unitcell",
  AXES: "axes",
  POLYHEDRA: "polyhedra",
  VIBRATION: "vibration",
  ANIMATION: "animation",
  PERSPECTIVE: "perspective",
  HALOS: "halos",
  HYDROGENS: "hydrogens",
} as const;
export type ToggleOptionValue = (typeof ToggleOption)[keyof typeof ToggleOption];

export const PickingMode = {
  ROTATE: "rotate",
  IDENTIFY: "identify",
  DISTANCE: "distance",
  ANGLE: "angle",
  TORSION: "torsion",
  SELECT: "select",
  CENTER: "center",
} as const;
export type PickingModeValue = (typeof PickingMode)[keyof typeof PickingMode];

/** What the engine needs from the viewer. Implemented by ViewerModel. */
export type ScriptTarget = {
  readonly displayState: DisplayState | null;
  selectionContext(): SelectionContext | null;
  /** Throws on failure (network, parse); the engine reports it. */
  load(request: LoadRequest, fromScript?: boolean): Promise<{ title: string; atomCount: number }>;
  setSpin(on: boolean, degreesPerSecond?: number): void;
  rotate(axis: Vec3, degrees: number): void;
  setZoomPercent(percent: number): void;
  zoomBy(factor: number): void;
  resetView(): void;
  centerOn(mask: Uint8Array | null): void;
  setBackground(color: number | null): void;
  addMeasurement(atoms: readonly number[]): number | null;
  clearMeasurements(): void;
  setToggle(option: ToggleOptionValue, on: boolean): void;
  setFrame(frame: number | "next" | "prev"): void;
  setPickingMode(mode: PickingModeValue): void;
  setColorScheme(scheme: ColorSchemeValue): void;
  setStyle(style: DisplayStyleValue): void;
  /** Called after any direct DisplayState edit so the view repaints. */
  displayChanged(): void;
  /** Resolves a library name such as "caffeine" or "quartz" to an id, or null. */
  findLibraryEntry(name: string): string | null;
};

const ON_WORDS = new Set(["on", "true", "yes", "1"]);
const OFF_WORDS = new Set(["off", "false", "no", "0", "none"]);

const STYLE_NAMES: Record<string, DisplayStyleValue> = {
  wireframe: DisplayStyle.WIREFRAME,
  sticks: DisplayStyle.STICKS,
  stick: DisplayStyle.STICKS,
  ballandstick: DisplayStyle.BALL_AND_STICK,
  ball: DisplayStyle.BALL_AND_STICK,
  spacefill: DisplayStyle.SPACEFILL,
  cpk: DisplayStyle.SPACEFILL,
  cartoon: DisplayStyle.CARTOON,
  cartoons: DisplayStyle.CARTOON,
  trace: DisplayStyle.TRACE,
  backbone: DisplayStyle.BACKBONE,
};

const COMMANDS = [
  "load",
  "select",
  "restrict",
  "display",
  "hide",
  "spacefill",
  "cpk",
  "wireframe",
  "style",
  "cartoon",
  "trace",
  "backbone",
  "color",
  "background",
  "label",
  "measure",
  "spin",
  "rotate",
  "zoom",
  "center",
  "reset",
  "hbonds",
  "unitcell",
  "axes",
  "polyhedra",
  "vibration",
  "animation",
  "frame",
  "set",
  "echo",
  "help",
];

/**
 * Splits a script into commands on `;` and new lines, dropping `#` comments, keeping quoted text intact.
 * A quote only opens a string at the start of a word, so nucleic-acid primes (`.C4'`) stay atom names.
 */
export function splitCommands(script: string): string[] {
  const out: string[] = [];
  for (const line of script.split(/\r?\n/)) {
    let current = "";
    let quote: string | null = null;
    for (const ch of line) {
      if (quote) {
        current += ch;
        if (ch === quote) {
          quote = null;
        }
      } else if ((ch === '"' || ch === "'") && !/[\w'*]$/.test(current)) {
        quote = ch;
        current += ch;
      } else if (ch === "#") {
        break;
      } else if (ch === ";") {
        out.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
  }
  return out.filter((c) => c.length > 0);
}

export class ScriptEngine {
  private readonly target: ScriptTarget;

  public constructor(target: ScriptTarget) {
    this.target = target;
  }

  /** Runs a whole script, returning every message in order. */
  public async run(script: string, isCurrent: () => boolean = () => true): Promise<ScriptMessage[]> {
    const messages: ScriptMessage[] = [];
    for (const command of splitCommands(script)) {
      if (!isCurrent()) {
        return [];
      }
      try {
        const result = await this.execute(command);
        if (!isCurrent()) {
          return [];
        }
        messages.push(...result);
        if (result.some((m) => m.isError)) {
          break; // Jmol stops a script at the first error.
        }
      } catch (error) {
        if (!isCurrent() || error instanceof ScriptCancelledError) {
          return [];
        }
        messages.push(
          error instanceof SelectionSyntaxError
            ? message(ScriptMessageKey.BAD_SELECTION, true, { token: error.token })
            : message(ScriptMessageKey.LOAD_FAILED, true, { reason: error instanceof Error ? error.message : "" }),
        );
        break;
      }
    }
    return messages;
  }

  private execute(command: string): ScriptMessage[] | Promise<ScriptMessage[]> {
    const [head = "", ...restTokens] = command.split(/\s+/);
    const verb = head.toLowerCase();
    const rest = command.slice(head.length).trim();
    const args = restTokens.map((t) => t.toLowerCase());
    const first = args[0] ?? "";

    if (verb === "help") {
      return [message(ScriptMessageKey.HELP, false, { commands: COMMANDS.join(", ") })];
    }
    if (verb === "echo") {
      return [message(ScriptMessageKey.ECHO, false, { text: rest.replace(/^["']|["']$/g, "") })];
    }
    if (verb === "load") {
      return this.load(rest);
    }
    // View commands that do not need a structure.
    switch (verb) {
      case "spin":
        if (first === "" || ON_WORDS.has(first)) {
          this.target.setSpin(true);
        } else if (OFF_WORDS.has(first)) {
          this.target.setSpin(false);
        } else {
          const rate = Number(first);
          if (!Number.isFinite(rate)) {
            return [badArgument(first)];
          }
          this.target.setSpin(rate !== 0, rate);
        }
        return [];
      case "rotate": {
        const axisName = ["x", "y", "z"].includes(first) ? first : "y";
        const degrees = Number(["x", "y", "z"].includes(first) ? args[1] : first);
        if (!Number.isFinite(degrees)) {
          return [badArgument(args.join(" "))];
        }
        const axis: Vec3 = axisName === "x" ? [1, 0, 0] : axisName === "y" ? [0, 1, 0] : [0, 0, 1];
        this.target.rotate(axis, degrees);
        return [];
      }
      case "zoom":
        if (first === "in") {
          this.target.zoomBy(1.25);
        } else if (first === "out") {
          this.target.zoomBy(0.8);
        } else if (first === "" || ON_WORDS.has(first)) {
          this.target.setZoomPercent(100);
        } else {
          const percent = Number(first.replace("%", ""));
          if (!Number.isFinite(percent) || percent <= 0) {
            return [badArgument(first)];
          }
          this.target.setZoomPercent(percent);
        }
        return [];
      case "reset":
        this.target.resetView();
        return [];
      case "background": {
        return this.background(first);
      }
      case "frame":
      case "model": {
        if (first === "next" || first === "prev") {
          this.target.setFrame(first);
          return [];
        }
        const n = Number(first);
        if (!Number.isInteger(n)) {
          return [badArgument(first)];
        }
        this.target.setFrame(n - 1);
        return [];
      }
      case "set":
        return this.set(args);
      default:
        break;
    }
    const toggle = this.toggleFor(verb);
    if (toggle) {
      this.target.setToggle(toggle, first === "" || ON_WORDS.has(first) || first === "calculate");
      return [];
    }

    const state = this.target.displayState;
    const context = this.target.selectionContext();
    if (!(state && context)) {
      return COMMANDS.includes(verb)
        ? [message(ScriptMessageKey.NO_STRUCTURE, true, {})]
        : [message(ScriptMessageKey.UNKNOWN_COMMAND, true, { command: head })];
    }

    switch (verb) {
      case "select": {
        state.setSelection(evaluateSelection(rest, context));
        this.target.displayChanged();
        return [message(ScriptMessageKey.SELECTED, false, { count: state.selectedCount() })];
      }
      case "restrict": {
        const mask = evaluateSelection(rest, context);
        state.setSelection(mask.map((v) => 1 - v));
        state.setHidden(true);
        state.setSelection(mask);
        state.setHidden(false);
        this.target.displayChanged();
        return [message(ScriptMessageKey.SELECTED, false, { count: state.selectedCount() })];
      }
      case "display":
      case "hide": {
        const previous = state.selected.slice();
        state.setSelection(evaluateSelection(rest || "all", context));
        state.setHidden(verb === "hide");
        state.setSelection(previous);
        this.target.displayChanged();
        return [];
      }
      case "spacefill":
      case "cpk":
        return this.spacefill(state, first);
      case "wireframe": {
        const value = ON_WORDS.has(first) || first === "" ? WIREFRAME_LINE : OFF_WORDS.has(first) ? 0 : Number(first);
        if (!Number.isFinite(value)) {
          return [badArgument(first)];
        }
        state.setBondRadius(value);
        this.target.displayChanged();
        return [];
      }
      case "style": {
        const style = STYLE_NAMES[first.replace(/[-_\s&]/g, "")];
        if (!style) {
          return [badArgument(first)];
        }
        this.target.setStyle(style);
        return [];
      }
      case "cartoon":
      case "cartoons":
      case "ribbon":
      case "ribbons":
      case "trace":
      case "backbone": {
        const kind = verb === "trace" ? "trace" : verb === "backbone" ? "backbone" : "cartoon";
        state.setPolymer(kind, !OFF_WORDS.has(first));
        this.target.displayChanged();
        return [];
      }
      case "color":
      case "colour":
        return this.color(state, args);
      case "label":
      case "labels": {
        const format = rest.replace(/^["']|["']$/g, "");
        state.setLabel(OFF_WORDS.has(first) ? null : ON_WORDS.has(first) || first === "" ? "%a" : format);
        this.target.displayChanged();
        return [];
      }
      case "measure":
      case "measures":
      case "measurements":
      case "monitor":
        return this.measure(args, context);
      case "center":
      case "centre":
        this.target.centerOn(rest ? evaluateSelection(rest, context) : null);
        return [];
      default:
        return [message(ScriptMessageKey.UNKNOWN_COMMAND, true, { command: head })];
    }
  }

  private async load(rest: string): Promise<ScriptMessage[]> {
    const rangeMatch = /\{\s*(\d+)\s+(\d+)\s+(\d+)\s*\}/.exec(rest);
    const range: Vec3 = rangeMatch
      ? ([Number(rangeMatch[1]), Number(rangeMatch[2]), Number(rangeMatch[3])].map((v) =>
          Math.min(4, Math.max(1, v)),
        ) as Vec3)
      : [1, 1, 1];
    const name = rest
      .replace(/\{[^}]*\}/, "")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (name === "") {
      return [badArgument("")];
    }
    let request: LoadRequest;
    if (name.startsWith("=")) {
      request = { source: "pdb", id: name.slice(1) };
    } else if (name.startsWith("$") || name.startsWith(":")) {
      request = { source: "pubchem", name: name.slice(1) };
    } else {
      const id = this.target.findLibraryEntry(name);
      // Unknown names fall back to PubChem, as Jmol's `load $name` does.
      request = id ? { source: "library", id, range } : { source: "pubchem", name };
    }
    const result = await this.target.load(request, true);
    return [message(ScriptMessageKey.LOADED, false, { title: result.title, count: result.atomCount })];
  }

  private background(arg: string): ScriptMessage[] {
    if (arg === "" || arg === "default") {
      this.target.setBackground(null);
      return [];
    }
    const color = parseColor(arg);
    if (color === null) {
      return [badArgument(arg)];
    }
    this.target.setBackground(color);
    return [];
  }

  private spacefill(state: DisplayState, arg: string): ScriptMessage[] {
    if (arg === "" || ON_WORDS.has(arg)) {
      state.setAtomRadius(100, true);
    } else if (OFF_WORDS.has(arg)) {
      state.setAtomRadius(0, false);
    } else if (arg.endsWith("%")) {
      const percent = Number(arg.slice(0, -1));
      if (!Number.isFinite(percent)) {
        return [badArgument(arg)];
      }
      state.setAtomRadius(percent, true);
    } else {
      const value = Number(arg);
      if (!Number.isFinite(value)) {
        return [badArgument(arg)];
      }
      // Jmol: integers are RasMol units of 1/250 Å; decimals are Å.
      state.setAtomRadius(arg.includes(".") ? value : value / 250, false);
    }
    this.target.displayChanged();
    return [];
  }

  private color(state: DisplayState, args: readonly string[]): ScriptMessage[] {
    let [what = "", value = ""] = args;
    if (what === "background") {
      return this.background(value);
    }
    if (["atoms", "atom", "cartoon", "cartoons", "bonds", "trace"].includes(what)) {
      what = value;
    }
    const scheme =
      COLOR_SCHEMES.find((s) => s.toLowerCase() === what.toLowerCase()) ??
      (what === "element" ? "cpk" : what === "jmol" ? "cpk" : what === "shapely" ? "amino" : undefined);
    if (scheme) {
      this.target.setColorScheme(scheme);
      return [];
    }
    const color = parseColor(args.slice(args[0] === what ? 0 : 1).join(""));
    if (color === null) {
      return [badArgument(what)];
    }
    state.setColor(color);
    this.target.displayChanged();
    return [];
  }

  private measure(args: readonly string[], context: SelectionContext): ScriptMessage[] {
    const first = args[0] ?? "";
    if (OFF_WORDS.has(first) || first === "delete") {
      this.target.clearMeasurements();
      return [];
    }
    // Each argument is an atom serial number or a parenthesised expression naming one atom.
    const joined = args.join(" ");
    const parts = joined.match(/\([^)]*\)|\S+/g) ?? [];
    const indices: number[] = [];
    for (const part of parts) {
      const expression = part.startsWith("(") ? part.slice(1, -1) : `atomno=${part}`;
      const mask = evaluateSelection(expression, context);
      const index = mask.indexOf(1);
      if (index < 0) {
        return [badArgument(part)];
      }
      indices.push(index);
    }
    if (indices.length < 2 || indices.length > 4) {
      return [badArgument(joined)];
    }
    const value = this.target.addMeasurement(indices);
    return value === null
      ? [badArgument(joined)]
      : [message(ScriptMessageKey.MEASURED, false, { value, count: indices.length })];
  }

  private set(args: readonly string[]): ScriptMessage[] {
    const [name = "", value = ""] = args;
    const on = !OFF_WORDS.has(value);
    switch (name) {
      case "perspectivedepth":
      case "perspective":
        this.target.setToggle(ToggleOption.PERSPECTIVE, on);
        return [];
      case "selectionhalos":
      case "halos":
        this.target.setToggle(ToggleOption.HALOS, on);
        return [];
      case "showhydrogens":
      case "hydrogens":
        this.target.setToggle(ToggleOption.HYDROGENS, on);
        return [];
      case "picking": {
        const mode = Object.values(PickingMode).find((m) => m === value) ?? (value === "ident" ? "identify" : null);
        if (!mode) {
          return [badArgument(value)];
        }
        this.target.setPickingMode(mode);
        return [];
      }
      case "background":
        return this.background(value);
      default:
        return [badArgument(name)];
    }
  }

  private toggleFor(verb: string): ToggleOptionValue | null {
    switch (verb) {
      case "hbonds":
      case "hbond":
        return ToggleOption.HBONDS;
      case "unitcell":
        return ToggleOption.UNIT_CELL;
      case "axes":
        return ToggleOption.AXES;
      case "polyhedra":
        return ToggleOption.POLYHEDRA;
      case "vibration":
        return ToggleOption.VIBRATION;
      case "animation":
      case "anim":
        return ToggleOption.ANIMATION;
      default:
        return null;
    }
  }
}

function message(
  key: ScriptMessageKeyValue,
  isError: boolean,
  args: Readonly<Record<string, string | number>>,
): ScriptMessage {
  return { key, isError, args };
}

function badArgument(argument: string): ScriptMessage {
  return message(ScriptMessageKey.BAD_ARGUMENT, true, { argument });
}
