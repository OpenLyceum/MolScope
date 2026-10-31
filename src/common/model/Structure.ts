/**
 * Structure.ts
 *
 * The plain-data description of a loaded structure, shared by every parser and
 * by the viewer. A Structure never changes after it is built: display state
 * (styles, colours, labels, selection) lives in {@link DisplayState}, and the
 * current animation frame is chosen by the viewer model.
 *
 * Coordinates are Cartesian ångströms. Multi-frame files (XYZ trajectories,
 * multi-model PDB, vibration modes) store one position array per frame.
 */

import type { ElementData } from "./Elements.js";
import type { Vec3 } from "./Geometry.js";
import type { UnitCell } from "./UnitCell.js";

/** Secondary-structure class of a residue (for cartoons and structure colouring). */
export const SecondaryStructure = {
  NONE: 0,
  HELIX: 1,
  SHEET: 2,
  TURN: 3,
} as const;
export type SecondaryStructureValue = (typeof SecondaryStructure)[keyof typeof SecondaryStructure];

/** File: HELIX/SHEET records. Geometry: estimated from Cα spacing. None: no protein residues. */
export const SecondaryStructureSource = {
  FILE: "file",
  GEOMETRY: "geometry",
  NONE: "none",
} as const;
export type SecondaryStructureSourceValue = (typeof SecondaryStructureSource)[keyof typeof SecondaryStructureSource];

export type Atom = {
  readonly element: ElementData;
  /** Atom name as in the file ("CA", "O1", "C12"); the element symbol plus an index if the file has none. */
  readonly name: string;
  /** 1-based serial number (PDB serial or position in the file). */
  readonly serial: number;
  /** Residue / group name ("ALA", "HOH"); empty for small molecules. */
  readonly residueName: string;
  /** Residue sequence number; 0 for small molecules. */
  readonly residueNumber: number;
  /** Chain identifier; empty for small molecules. */
  readonly chain: string;
  /** PDB HETATM record (ligands, waters, ions). */
  readonly hetero: boolean;
  /** Crystallographic temperature factor (B-factor), Å². */
  readonly bFactor: number;
  /** Partial occupancy, 0–1. */
  readonly occupancy: number;
  /** Formal charge from the file, if any. */
  readonly formalCharge: number;
  /** Secondary structure of this atom's residue. */
  secondaryStructure: SecondaryStructureValue;
  /** Index of this atom's residue in {@link Structure.residues}, or -1. */
  residueIndex: number;
};

export type Bond = {
  readonly a: number;
  readonly b: number;
  /** 1, 2, 3, or 1.5 for aromatic. */
  readonly order: number;
};

/** One residue (amino acid, nucleotide, ligand or water) in a biomolecule. */
export type Residue = {
  readonly name: string;
  readonly number: number;
  readonly chain: string;
  /** Inclusive start and exclusive end of the residue's atoms in {@link Structure.atoms}. */
  readonly firstAtom: number;
  readonly endAtom: number;
  /** Index of the CA atom (protein) or P atom (nucleic), or -1. */
  readonly leadAtom: number;
  /** Index of the backbone carbonyl O (protein) or the C1' / C4' atom (nucleic), or -1. */
  readonly guideAtom: number;
  readonly kind: ResidueKindValue;
};

export const ResidueKind = {
  OTHER: 0,
  AMINO: 1,
  NUCLEIC: 2,
  WATER: 3,
} as const;
export type ResidueKindValue = (typeof ResidueKind)[keyof typeof ResidueKind];

export type Frame = {
  /** Comment line or model title for this frame ("" when none). */
  readonly comment: string;
  /** x0, y0, z0, x1, … in Å. */
  readonly positions: Float64Array;
  /** Optional vibration displacement per atom (same layout), Å at full amplitude. */
  readonly vibrations: Float64Array | null;
};

export type Structure = {
  readonly title: string;
  /** Source format, for the info panel ("PDB", "MOL", "XYZ", "CIF"). */
  readonly format: string;
  readonly atoms: readonly Atom[];
  readonly bonds: readonly Bond[];
  readonly residues: readonly Residue[];
  readonly frames: readonly Frame[];
  /** Crystal cell when the file defines one (CIF, PDB CRYST1). */
  readonly unitCell: UnitCell | null;
  /** Actual packed dimensions along a, b, c; [1,1,1] for unpacked files. */
  readonly cellRange: Vec3;
  /** True for structures with polymer residues (cartoon/trace make sense). */
  readonly isBiomolecule: boolean;
  /** Where protein secondary structure came from, so the view can say when it is only estimated. */
  readonly secondaryStructureSource: SecondaryStructureSourceValue;
};

/** Reads atom i's position from a frame without allocating. */
export function atomPosition(frame: Frame, index: number, out: [number, number, number]): [number, number, number] {
  const p = frame.positions;
  out[0] = p[3 * index] ?? 0;
  out[1] = p[3 * index + 1] ?? 0;
  out[2] = p[3 * index + 2] ?? 0;
  return out;
}
