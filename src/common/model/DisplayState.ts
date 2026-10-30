/**
 * DisplayState.ts
 *
 * Per-atom rendering state, the same model Jmol uses: every atom carries its own
 * sphere radius, bond radius, colour, label and polymer-ribbon flags, and every
 * command (from a menu, a button or the script console) edits those values for the
 * currently selected atoms only. That is what lets a user show a protein as a cartoon
 * with its ligand in ball-and-stick and one residue in space-fill at the same time.
 *
 * Plain typed arrays, no Properties: the viewer model bumps a revision counter after
 * each edit so the view knows to repaint.
 */

import type { ColorSchemeValue } from "./ColorSchemes.js";
import { applyColorScheme } from "./ColorSchemes.js";
import type { Structure } from "./Structure.js";
import { ResidueKind } from "./Structure.js";

/** Bond radius meaning "draw as a thin line" (Jmol `wireframe on`). */
export const WIREFRAME_LINE = -1;

/** Jmol's default stick radius, Å (`wireframe 0.15`). */
export const STICK_RADIUS = 0.15;

/** Ball-and-stick ball size, fraction of the van der Waals radius (Jmol `spacefill 20%`). */
export const BALL_FRACTION = 0.2;

export const DisplayStyle = {
  WIREFRAME: "wireframe",
  STICKS: "sticks",
  BALL_AND_STICK: "ballAndStick",
  SPACEFILL: "spacefill",
  CARTOON: "cartoon",
  TRACE: "trace",
  BACKBONE: "backbone",
} as const;
export type DisplayStyleValue = (typeof DisplayStyle)[keyof typeof DisplayStyle];

export const SMALL_MOLECULE_STYLES: readonly DisplayStyleValue[] = [
  DisplayStyle.BALL_AND_STICK,
  DisplayStyle.STICKS,
  DisplayStyle.WIREFRAME,
  DisplayStyle.SPACEFILL,
];

export const BIOMOLECULE_STYLES: readonly DisplayStyleValue[] = [
  DisplayStyle.CARTOON,
  DisplayStyle.TRACE,
  DisplayStyle.BACKBONE,
  ...SMALL_MOLECULE_STYLES,
];

export const LabelMode = {
  NONE: "none",
  ELEMENT: "element",
  NAME: "name",
  NUMBER: "number",
  RESIDUE: "residue",
} as const;
export type LabelModeValue = (typeof LabelMode)[keyof typeof LabelMode];

/** Jmol label format for each preset. */
export const LABEL_FORMATS: Record<LabelModeValue, string | null> = {
  none: null,
  element: "%e",
  name: "%a",
  number: "%i",
  residue: "%n%r",
};

export class DisplayState {
  public readonly structure: Structure;
  /** Sphere radius per atom, Å; 0 hides the sphere. */
  public readonly atomRadius: Float32Array;
  /** Bond radius per atom, Å; 0 hides its bonds, {@link WIREFRAME_LINE} draws a line. */
  public readonly bondRadius: Float32Array;
  public readonly colors: Uint32Array;
  public readonly labels: (string | null)[];
  /** Cartoon / trace / backbone flags, read on each residue's lead atom. */
  public readonly cartoon: Uint8Array;
  public readonly trace: Uint8Array;
  public readonly backbone: Uint8Array;
  /** What the renderer reads: hidden by `hide` / `restrict`, or a hydrogen while the hydrogens toggle is off. */
  public readonly hidden: Uint8Array;
  public readonly selected: Uint8Array;
  /** Hidden by `hide` / `restrict` alone, so the hydrogens toggle cannot overwrite it. */
  private readonly explicitlyHidden: Uint8Array;
  private hydrogensHidden = false;

  public constructor(structure: Structure) {
    this.structure = structure;
    const n = structure.atoms.length;
    this.atomRadius = new Float32Array(n);
    this.bondRadius = new Float32Array(n);
    this.colors = new Uint32Array(n);
    this.labels = new Array<string | null>(n).fill(null);
    this.cartoon = new Uint8Array(n);
    this.trace = new Uint8Array(n);
    this.backbone = new Uint8Array(n);
    this.hidden = new Uint8Array(n);
    this.explicitlyHidden = new Uint8Array(n);
    this.selected = new Uint8Array(n).fill(1);
    const all = new Uint8Array(n).fill(1);
    applyColorScheme(structure, "cpk", all, this.colors);
  }

  public get atomCount(): number {
    return this.structure.atoms.length;
  }

  public selectedCount(): number {
    let count = 0;
    for (const v of this.selected) {
      count += v;
    }
    return count;
  }

  public setSelection(mask: Uint8Array): void {
    this.selected.set(mask);
  }

  public isDisplayed(index: number): boolean {
    if (this.hidden[index]) {
      return false;
    }
    if ((this.atomRadius[index] ?? 0) > 0 || (this.bondRadius[index] ?? 0) !== 0 || this.labels[index]) {
      return true;
    }
    const residue = this.structure.residues[this.structure.atoms[index]?.residueIndex ?? -1];
    if (residue && residue.leadAtom >= 0) {
      const lead = residue.leadAtom;
      return !!(this.cartoon[lead] || this.trace[lead] || this.backbone[lead]);
    }
    return false;
  }

  /** Jmol `spacefill`: radius in Å, or a percentage of the vdW radius when `percent` is true. */
  public setAtomRadius(value: number, percent: boolean): void {
    this.forSelected((i) => {
      const atom = this.structure.atoms[i];
      this.atomRadius[i] = percent ? ((atom?.element.vdwRadius ?? 1.5) * value) / 100 : value;
    });
  }

  /** Jmol `wireframe`: Å radius, 0 (off) or {@link WIREFRAME_LINE}. */
  public setBondRadius(value: number): void {
    this.forSelected((i) => {
      this.bondRadius[i] = value;
    });
  }

  public setPolymer(kind: "cartoon" | "trace" | "backbone", on: boolean): void {
    const target = this[kind];
    this.forSelected((i) => {
      target[i] = on ? 1 : 0;
    });
  }

  public setColor(color: number): void {
    this.forSelected((i) => {
      this.colors[i] = color;
    });
  }

  public setColorScheme(scheme: ColorSchemeValue): void {
    applyColorScheme(this.structure, scheme, this.selected, this.colors);
  }

  public setLabel(format: string | null): void {
    this.forSelected((i) => {
      this.labels[i] = format === null ? null : formatLabel(this.structure, i, format);
    });
  }

  public setHidden(hidden: boolean): void {
    this.forSelected((i) => {
      this.explicitlyHidden[i] = hidden ? 1 : 0;
    });
    this.updateHidden();
  }

  /** The hydrogens toggle: hides every hydrogen on top of `hide` / `restrict`, without touching them. */
  public setHydrogensHidden(hidden: boolean): void {
    this.hydrogensHidden = hidden;
    this.updateHidden();
  }

  private updateHidden(): void {
    const atoms = this.structure.atoms;
    for (let i = 0; i < atoms.length; i++) {
      const hydrogen = this.hydrogensHidden && atoms[i]?.element.number === 1;
      this.hidden[i] = this.explicitlyHidden[i] || hydrogen ? 1 : 0;
    }
  }

  /** Applies a menu preset to the selection, the way Jmol's pop-up "Style" menu does. */
  public applyStyle(style: DisplayStyleValue): void {
    const polymer = style === DisplayStyle.CARTOON || style === DisplayStyle.TRACE || style === DisplayStyle.BACKBONE;
    const residues = this.structure.residues;
    this.forSelected((i) => {
      const atom = this.structure.atoms[i];
      const vdw = atom?.element.vdwRadius ?? 1.5;
      const kind = residues[atom?.residueIndex ?? -1]?.kind;
      const inPolymer = kind === ResidueKind.AMINO || kind === ResidueKind.NUCLEIC;
      this.cartoon[i] = 0;
      this.trace[i] = 0;
      this.backbone[i] = 0;
      if (polymer) {
        if (inPolymer) {
          this.atomRadius[i] = 0;
          this.bondRadius[i] = 0;
          this[style][i] = 1;
        } else if (kind === ResidueKind.WATER) {
          this.atomRadius[i] = 0;
          this.bondRadius[i] = 0;
        } else {
          // Ligands, ions and cofactors stay visible as ball-and-stick around a ribbon.
          this.atomRadius[i] = vdw * BALL_FRACTION;
          this.bondRadius[i] = STICK_RADIUS;
        }
        return;
      }
      switch (style) {
        case DisplayStyle.WIREFRAME:
          this.atomRadius[i] = 0;
          this.bondRadius[i] = WIREFRAME_LINE;
          break;
        case DisplayStyle.STICKS:
          this.atomRadius[i] = STICK_RADIUS;
          this.bondRadius[i] = STICK_RADIUS;
          break;
        case DisplayStyle.BALL_AND_STICK:
          this.atomRadius[i] = vdw * BALL_FRACTION;
          this.bondRadius[i] = STICK_RADIUS;
          break;
        case DisplayStyle.SPACEFILL:
          this.atomRadius[i] = vdw;
          this.bondRadius[i] = 0;
          break;
        default:
          break;
      }
    });
  }

  private forSelected(callback: (index: number) => void): void {
    const n = this.atomCount;
    for (let i = 0; i < n; i++) {
      if (this.selected[i]) {
        callback(i);
      }
    }
  }
}

/**
 * Expands a Jmol label format: %a atom name, %e element, %i serial number,
 * %n residue name, %r residue number, %c chain, %b B-factor, %q occupancy, %% percent.
 */
export function formatLabel(structure: Structure, index: number, format: string): string {
  const atom = structure.atoms[index];
  if (!atom) {
    return "";
  }
  return format.replace(/%([aeinrcbq%])/g, (_match, code: string) => {
    switch (code) {
      case "a":
        return atom.name;
      case "e":
        return atom.element.symbol;
      case "i":
        return String(atom.serial);
      case "n":
        return atom.residueName;
      case "r":
        return atom.residueNumber ? String(atom.residueNumber) : "";
      case "c":
        return atom.chain;
      case "b":
        return atom.bFactor.toFixed(2);
      case "q":
        return atom.occupancy.toFixed(2);
      default:
        return "%";
    }
  });
}
