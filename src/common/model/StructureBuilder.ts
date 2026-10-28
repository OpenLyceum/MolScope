/**
 * StructureBuilder.ts
 *
 * Turns the raw atom list a parser produces into a finished {@link Structure}:
 * groups atoms into residues, finds polymer backbones, assigns secondary
 * structure (from file records when present, otherwise from Cα geometry), and
 * perceives bonds when the file did not list them.
 */

import { perceiveBonds } from "./BondPerception.js";
import type { Atom, Bond, Frame, Residue, ResidueKindValue, SecondaryStructureValue, Structure } from "./Structure.js";
import { ResidueKind, SecondaryStructure } from "./Structure.js";
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

export const WATERS = new Set(["HOH", "WAT", "H2O", "DOD", "TIP", "TIP3", "SOL"]);

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
};

export function buildStructure(input: BuildInput): Structure {
  const atoms = input.atoms;
  const firstFrame = input.frames[0];
  const positions = firstFrame ? firstFrame.positions : new Float64Array(0);
  const residues = buildResidues(atoms);
  const isBiomolecule = residues.some((r) => r.kind === ResidueKind.AMINO || r.kind === ResidueKind.NUCLEIC);

  if (input.ranges && input.ranges.length > 0) {
    applyRanges(atoms, residues, input.ranges);
  } else if (isBiomolecule) {
    assignFromGeometry(atoms, residues, positions);
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
    isBiomolecule,
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

function buildResidues(atoms: Atom[]): Residue[] {
  const residues: Residue[] = [];
  let start = 0;
  const finish = (end: number) => {
    const first = atoms[start];
    if (!(first && first.residueName)) {
      return;
    }
    const kind = residueKind(first.residueName);
    let lead = -1;
    let guide = -1;
    for (let i = start; i < end; i++) {
      const name = atoms[i]?.name ?? "";
      if (kind === ResidueKind.AMINO) {
        if (name === "CA") {
          lead = i;
        } else if (name === "O") {
          guide = i;
        }
      } else if (kind === ResidueKind.NUCLEIC) {
        if (name === "P") {
          lead = i;
        } else if (name === "C1'" || name === "C1*") {
          guide = i;
        } else if (lead < 0 && (name === "C4'" || name === "C4*")) {
          // 5′-terminal nucleotides often lack the phosphate; C4′ stands in on the backbone.
          lead = i;
        }
      }
    }
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

/**
 * Fallback secondary structure from Cα geometry alone (in the spirit of Jmol's
 * `calculate structure` for files with no HELIX/SHEET records): an α-helix packs
 * Cα(i)–Cα(i+3) at about 5.0–5.6 Å, a β-strand stretches Cα(i)–Cα(i+2) to 6.4–7.0 Å.
 */
function assignFromGeometry(atoms: Atom[], residues: readonly Residue[], positions: Float64Array): void {
  const ca = residues.filter((r) => r.kind === ResidueKind.AMINO && r.leadAtom >= 0);
  const dist = (i: number, j: number) => {
    const a = ca[i]?.leadAtom ?? 0;
    const b = ca[j]?.leadAtom ?? 0;
    return Math.hypot(
      (positions[3 * a] ?? 0) - (positions[3 * b] ?? 0),
      (positions[3 * a + 1] ?? 0) - (positions[3 * b + 1] ?? 0),
      (positions[3 * a + 2] ?? 0) - (positions[3 * b + 2] ?? 0),
    );
  };
  const sameChain = (i: number, j: number) => ca[i]?.chain === ca[j]?.chain;
  const kinds: SecondaryStructureValue[] = ca.map(() => SecondaryStructure.NONE);
  for (let i = 0; i + 3 < ca.length; i++) {
    if (sameChain(i, i + 3)) {
      const d3 = dist(i, i + 3);
      const d4 = i + 4 < ca.length && sameChain(i, i + 4) ? dist(i, i + 4) : 0;
      if (d3 > 4.6 && d3 < 5.7 && d4 > 5.6 && d4 < 6.8) {
        for (let k = i; k <= i + 3; k++) {
          kinds[k] = SecondaryStructure.HELIX;
        }
      }
    }
  }
  for (let i = 0; i + 2 < ca.length; i++) {
    if (sameChain(i, i + 2) && kinds[i] === SecondaryStructure.NONE) {
      const d2 = dist(i, i + 2);
      const d4 = i + 4 < ca.length && sameChain(i, i + 4) ? dist(i, i + 4) : 0;
      if (d2 > 6.3 && d4 > 12.4) {
        for (let k = i; k <= i + 2; k++) {
          if (kinds[k] === SecondaryStructure.NONE) {
            kinds[k] = SecondaryStructure.SHEET;
          }
        }
      }
    }
  }
  ca.forEach((residue, index) => {
    const kind = kinds[index] ?? SecondaryStructure.NONE;
    for (let i = residue.firstAtom; i < residue.endAtom; i++) {
      const atom = atoms[i];
      if (atom) {
        atom.secondaryStructure = kind;
      }
    }
  });
}
