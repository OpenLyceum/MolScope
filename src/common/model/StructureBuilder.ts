import { STRUCTURE_BUILDER_SETTINGS } from "../../MolScopeConstants.js";
/**
 * StructureBuilder.ts
 *
 * Turns the raw atom list a parser produces into a finished {@link Structure}:
 * groups atoms into residues, finds polymer backbones, assigns secondary
 * structure (from file records when present, otherwise from Cα geometry), and
 * perceives bonds when the file did not list them.
 */

import { perceiveBonds } from "./BondPerception.js";
import type { Vec3 } from "./Geometry.js";
import type {
  Atom,
  Bond,
  Frame,
  Residue,
  ResidueKindValue,
  SecondaryStructureSourceValue,
  SecondaryStructureValue,
  Structure,
} from "./Structure.js";
import { ResidueKind, SecondaryStructure, SecondaryStructureSource } from "./Structure.js";
import { validateFrames } from "./StructureValidation.js";
import type { UnitCell } from "./UnitCell.js";

/** Standard amino-acid residue names (plus common variants). */
export const AMINO_ACIDS = new Set([
  "ALA",
  "ARG",
  "ASN",
  "ASP",
  "CYS",
  "GLN",
  "GLU",
  "GLY",
  "HIS",
  "ILE",
  "LEU",
  "LYS",
  "MET",
  "PHE",
  "PRO",
  "SER",
  "THR",
  "TRP",
  "TYR",
  "VAL",
  "ASX",
  "GLX",
  "MSE",
  "SEC",
  "PYL",
  "HID",
  "HIE",
  "HIP",
  "CYX",
]);

/** Standard nucleotide residue names (DNA and RNA). */
export const NUCLEOTIDES = new Set(["A", "C", "G", "T", "U", "I", "DA", "DC", "DG", "DT", "DU", "DI"]);

const WATERS = new Set(["HOH", "WAT", "H2O", "DOD", "TIP", "TIP3", "SOL"]);

/** A residue range from HELIX / SHEET records. */
export type StructureRange = {
  readonly kind: SecondaryStructureValue;
  readonly chain: string;
  readonly start: number;
  readonly end: number;
};

export type BuildInput = {
  readonly title: string;
  readonly format: string;
  /** Atoms with `residueIndex` and `secondaryStructure` still unset (any value). */
  readonly atoms: Atom[];
  readonly frames: readonly Frame[];
  /** Explicit bonds from the file; perception still runs when `perceive` is true. */
  readonly bonds?: readonly Bond[];
  readonly perceive?: boolean;
  readonly ranges?: readonly StructureRange[];
  readonly unitCell?: UnitCell | null;
  readonly skipLikePairs?: boolean;
  readonly cellRange?: Vec3;
};

export function buildStructure(input: BuildInput): Structure {
  const atoms = input.atoms;
  validateFrames(atoms.length, input.frames);
  const firstFrame = input.frames[0];
  const positions = firstFrame ? firstFrame.positions : new Float64Array(0);
  const residues = buildResidues(atoms);
  const isBiomolecule = residues.some((r) => r.kind === ResidueKind.AMINO || r.kind === ResidueKind.NUCLEIC);

  let secondaryStructureSource: SecondaryStructureSourceValue = SecondaryStructureSource.NONE;
  if (input.ranges && input.ranges.length > 0) {
    applyRanges(atoms, residues, input.ranges);
    secondaryStructureSource = SecondaryStructureSource.FILE;
  } else if (residues.some((r) => r.kind === ResidueKind.AMINO)) {
    assignFromGeometry(atoms, residues, positions);
    secondaryStructureSource = SecondaryStructureSource.GEOMETRY;
  }

  let bonds: Bond[] = [...(input.bonds ?? [])];
  if (input.perceive !== false && (bonds.length === 0 || isBiomolecule)) {
    const perceived = perceiveBonds(atoms, positions, input.skipLikePairs ? { skipLikePairs: true } : {});
    bonds = mergeBonds(bonds, perceived);
  }

  return {
    title: input.title,
    format: input.format,
    atoms,
    bonds,
    residues,
    frames: input.frames,
    unitCell: input.unitCell ?? null,
    cellRange: input.cellRange ? [...input.cellRange] : [1, 1, 1],
    isBiomolecule,
    secondaryStructureSource,
  };
}

/** Explicit bonds win (they carry bond orders); perceived ones fill the gaps. */
function mergeBonds(explicit: readonly Bond[], perceived: readonly Bond[]): Bond[] {
  const seen = new Set<string>();
  const out: Bond[] = [];
  for (const bond of [...explicit, ...perceived]) {
    const key = bond.a < bond.b ? `${bond.a}-${bond.b}` : `${bond.b}-${bond.a}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(bond);
    }
  }
  return out;
}

function residueKind(name: string): ResidueKindValue {
  const upper = name.toUpperCase();
  if (AMINO_ACIDS.has(upper)) {
    return ResidueKind.AMINO;
  }
  if (NUCLEOTIDES.has(upper)) {
    return ResidueKind.NUCLEIC;
  }
  if (WATERS.has(upper)) {
    return ResidueKind.WATER;
  }
  return ResidueKind.OTHER;
}

/** Lead (CA) and guide (O) atom indices for an amino-acid residue. */
function aminoLeadGuide(atoms: readonly Atom[], start: number, end: number): { lead: number; guide: number } {
  let lead = -1;
  let guide = -1;
  for (let i = start; i < end; i++) {
    const name = atoms[i]?.name ?? "";
    if (name === "CA") {
      lead = i;
    } else if (name === "O") {
      guide = i;
    }
  }
  return { lead, guide };
}

/** Lead (P / C4′) and guide (C1′) atom indices for a nucleotide residue. */
function nucleicLeadGuide(atoms: readonly Atom[], start: number, end: number): { lead: number; guide: number } {
  let lead = -1;
  let guide = -1;
  for (let i = start; i < end; i++) {
    const name = atoms[i]?.name ?? "";
    if (name === "P") {
      lead = i;
    } else if (name === "C1'" || name === "C1*") {
      guide = i;
    } else if (lead < 0 && (name === "C4'" || name === "C4*")) {
      // 5′-terminal nucleotides often lack the phosphate; C4′ stands in on the backbone.
      lead = i;
    }
  }
  return { lead, guide };
}

function leadGuideForKind(
  kind: ResidueKindValue,
  atoms: readonly Atom[],
  start: number,
  end: number,
): { lead: number; guide: number } {
  if (kind === ResidueKind.AMINO) {
    return aminoLeadGuide(atoms, start, end);
  }
  if (kind === ResidueKind.NUCLEIC) {
    return nucleicLeadGuide(atoms, start, end);
  }
  return { lead: -1, guide: -1 };
}

function buildResidues(atoms: Atom[]): Residue[] {
  const residues: Residue[] = [];
  let start = 0;
  const finish = (end: number) => {
    const first = atoms[start];
    if (!first?.residueName) {
      return;
    }
    const kind = residueKind(first.residueName);
    const { lead, guide } = leadGuideForKind(kind, atoms, start, end);
    const index = residues.length;
    for (let i = start; i < end; i++) {
      const atom = atoms[i];
      if (atom) {
        atom.residueIndex = index;
      }
    }
    residues.push({
      name: first.residueName,
      number: first.residueNumber,
      chain: first.chain,
      firstAtom: start,
      endAtom: end,
      leadAtom: lead,
      guideAtom: guide,
      kind,
    });
  };
  for (let i = 1; i <= atoms.length; i++) {
    const prev = atoms[i - 1];
    const cur = atoms[i];
    if (
      !(cur && prev) ||
      cur.residueNumber !== prev.residueNumber ||
      cur.chain !== prev.chain ||
      cur.residueName !== prev.residueName
    ) {
      finish(i);
      start = i;
    }
  }
  return residues;
}

function applyRanges(atoms: Atom[], residues: readonly Residue[], ranges: readonly StructureRange[]): void {
  for (const residue of residues) {
    if (residue.kind !== ResidueKind.AMINO) {
      continue;
    }
    const range = ranges.find((r) => r.chain === residue.chain && residue.number >= r.start && residue.number <= r.end);
    if (range) {
      for (let i = residue.firstAtom; i < residue.endAtom; i++) {
        const atom = atoms[i];
        if (atom) {
          atom.secondaryStructure = range.kind;
        }
      }
    }
  }
}

type CaGeometry = {
  readonly length: number;
  dist(i: number, j: number): number;
  sameChain(i: number, j: number): boolean;
};

/** Marks helix runs where Cα(i)–Cα(i+3) and Cα(i)–Cα(i+4) pack in the α-helix range. */
function scoreHelices(ca: CaGeometry, kinds: SecondaryStructureValue[]): void {
  for (let i = 0; i + 3 < ca.length; i++) {
    if (!ca.sameChain(i, i + 3)) {
      continue;
    }
    const d3 = ca.dist(i, i + 3);
    const d4 = i + 4 < ca.length && ca.sameChain(i, i + 4) ? ca.dist(i, i + 4) : 0;
    if (
      d3 > STRUCTURE_BUILDER_SETTINGS.HELIX_I3_MIN_DISTANCE &&
      d3 < STRUCTURE_BUILDER_SETTINGS.HELIX_I3_MAX_DISTANCE &&
      d4 > STRUCTURE_BUILDER_SETTINGS.HELIX_I4_MIN_DISTANCE &&
      d4 < STRUCTURE_BUILDER_SETTINGS.HELIX_I4_MAX_DISTANCE
    ) {
      for (let k = i; k <= i + 3; k++) {
        kinds[k] = SecondaryStructure.HELIX;
      }
    }
  }
}

/** Marks strand runs where Cα(i)–Cα(i+2) and Cα(i)–Cα(i+4) stretch in the β-sheet range. */
function scoreStrands(ca: CaGeometry, kinds: SecondaryStructureValue[]): void {
  for (let i = 0; i + 2 < ca.length; i++) {
    if (!(ca.sameChain(i, i + 2) && kinds[i] === SecondaryStructure.NONE)) {
      continue;
    }
    const d2 = ca.dist(i, i + 2);
    const d4 = i + 4 < ca.length && ca.sameChain(i, i + 4) ? ca.dist(i, i + 4) : 0;
    if (
      d2 > STRUCTURE_BUILDER_SETTINGS.SHEET_I2_MIN_DISTANCE &&
      d4 > STRUCTURE_BUILDER_SETTINGS.SHEET_I4_MIN_DISTANCE
    ) {
      for (let k = i; k <= i + 2; k++) {
        if (kinds[k] === SecondaryStructure.NONE) {
          kinds[k] = SecondaryStructure.SHEET;
        }
      }
    }
  }
}

/**
 * Fallback secondary structure from Cα geometry alone (in the spirit of Jmol's
 * `calculate structure` for files with no HELIX/SHEET records): an α-helix packs
 * Cα(i)–Cα(i+3) at about 5.0–5.6 Å, a β-strand stretches Cα(i)–Cα(i+2) to 6.4–7.0 Å.
 */
function assignFromGeometry(atoms: Atom[], residues: readonly Residue[], positions: Float64Array): void {
  const caResidues = residues.filter((r) => r.kind === ResidueKind.AMINO && r.leadAtom >= 0);
  const ca: CaGeometry = {
    length: caResidues.length,
    dist(i: number, j: number) {
      const a = caResidues[i]?.leadAtom ?? 0;
      const b = caResidues[j]?.leadAtom ?? 0;
      return Math.hypot(
        (positions[3 * a] ?? 0) - (positions[3 * b] ?? 0),
        (positions[3 * a + 1] ?? 0) - (positions[3 * b + 1] ?? 0),
        (positions[3 * a + 2] ?? 0) - (positions[3 * b + 2] ?? 0),
      );
    },
    sameChain(i: number, j: number) {
      return caResidues[i]?.chain === caResidues[j]?.chain;
    },
  };
  const kinds: SecondaryStructureValue[] = caResidues.map(() => SecondaryStructure.NONE);
  scoreHelices(ca, kinds);
  scoreStrands(ca, kinds);
  caResidues.forEach((residue, index) => {
    const kind = kinds[index] ?? SecondaryStructure.NONE;
    for (let i = residue.firstAtom; i < residue.endAtom; i++) {
      const atom = atoms[i];
      if (atom) {
        atom.secondaryStructure = kind;
      }
    }
  });
}
