import { HYDROGEN_BONDS_SETTINGS } from "../../MolScopeConstants.js";
/**
 * HydrogenBonds.ts
 *
 * A geometric hydrogen-bond finder in the spirit of Jmol's `hbonds calculate`:
 * a donor–acceptor pair of N/O atoms 2.5–3.5 Å apart, not covalently bonded and not
 * in the same residue (or, for small molecules, not sharing a neighbour). Works
 * without explicit hydrogens, which most crystal structures lack.
 */

import type { Atom, Bond, Structure } from "./Structure.js";

export const HBOND_MIN_DISTANCE: number = HYDROGEN_BONDS_SETTINGS.HBOND_MIN_DISTANCE; // Å
export const HBOND_MAX_DISTANCE: number = HYDROGEN_BONDS_SETTINGS.HBOND_MAX_DISTANCE; // Å

export function findHydrogenBonds(structure: Structure, positions: Float64Array): Bond[] {
  const polar: number[] = [];
  structure.atoms.forEach((atom, i) => {
    if (atom.element.number === 7 || atom.element.number === 8) {
      polar.push(i);
    }
  });
  const neighbors = new Map<number, Set<number>>();
  for (const bond of structure.bonds) {
    (neighbors.get(bond.a) ?? neighbors.set(bond.a, new Set()).get(bond.a))?.add(bond.b);
    (neighbors.get(bond.b) ?? neighbors.set(bond.b, new Set()).get(bond.b))?.add(bond.a);
  }
  const cell = HBOND_MAX_DISTANCE;
  const grid = new Map<string, number[]>();
  const key = (i: number) => [0, 1, 2].map((k) => Math.floor((positions[3 * i + k] ?? 0) / cell));
  for (const i of polar) {
    const k = key(i).join(",");
    (grid.get(k) ?? grid.set(k, []).get(k))?.push(i);
  }
  const out: Bond[] = [];
  const min2 = HBOND_MIN_DISTANCE ** 2;
  const max2 = HBOND_MAX_DISTANCE ** 2;
  for (const a of polar) {
    collectHBondsForDonor(a, key(a), structure.atoms, positions, neighbors, grid, min2, max2, out);
  }
  return out;
}

function collectHBondsForDonor(
  a: number,
  gridCell: readonly number[],
  atoms: readonly Atom[],
  positions: Float64Array,
  neighbors: Map<number, Set<number>>,
  grid: Map<string, number[]>,
  min2: number,
  max2: number,
  out: Bond[],
): void {
  const [gx = 0, gy = 0, gz = 0] = gridCell;
  const atomA = atoms[a];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const b of grid.get(`${gx + dx},${gy + dy},${gz + dz}`) ?? []) {
          maybeAddHBond(a, b, atomA, atoms, positions, neighbors, min2, max2, out);
        }
      }
    }
  }
}

function maybeAddHBond(
  a: number,
  b: number,
  atomA: Atom | undefined,
  atoms: readonly Atom[],
  positions: Float64Array,
  neighbors: Map<number, Set<number>>,
  min2: number,
  max2: number,
  out: Bond[],
): void {
  if (b <= a) {
    return;
  }
  const atomB = atoms[b];
  if (!(atomA && atomB) || isExcludedHBondPair(atomA, atomB, a, b, neighbors)) {
    return;
  }
  const ddx = (positions[3 * a] ?? 0) - (positions[3 * b] ?? 0);
  const ddy = (positions[3 * a + 1] ?? 0) - (positions[3 * b + 1] ?? 0);
  const ddz = (positions[3 * a + 2] ?? 0) - (positions[3 * b + 2] ?? 0);
  const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
  if (d2 >= min2 && d2 <= max2) {
    out.push({ a, b, order: 0 });
  }
}

function isExcludedHBondPair(
  atomA: Atom,
  atomB: Atom,
  a: number,
  b: number,
  neighbors: Map<number, Set<number>>,
): boolean {
  if (atomA.residueIndex >= 0 && atomA.residueIndex === atomB.residueIndex) {
    return true;
  }
  const na = neighbors.get(a);
  const nb = neighbors.get(b);
  return Boolean(na?.has(b) || (na && nb && [...na].some((x) => nb.has(x))));
}
