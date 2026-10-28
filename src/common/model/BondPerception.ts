/**
 * BondPerception.ts
 *
 * Jmol-style automatic bonding: two atoms are bonded when their distance is less
 * than the sum of their covalent radii plus a tolerance (0.45 Å), and more than a
 * minimum (0.4 Å, to skip overlapping alternate positions). A uniform spatial hash
 * keeps it O(n) so whole proteins rebond instantly.
 */

import type { Atom, Bond } from "./Structure.js";

/** Jmol's default `bondTolerance`, Å. */
export const BOND_TOLERANCE = 0.45;

/** Jmol's default `minBondDistance`, Å. */
export const MIN_BOND_DISTANCE = 0.4;

/** Pauling electronegativity at or above which an element counts as an anion former (S, N, O, halogens…). */
export const ANION_ELECTRONEGATIVITY = 2.5;

export type BondPerceptionOptions = {
  /**
   * Crystal mode. When the structure has more than one element, skip bonds between atoms of the
   * same element (Cs–Cs in CsCl sits inside the covalent cut-off), and when it also has anion
   * formers, skip cation–cation contacts (Ca–Ti in perovskite). Pure metals keep their bonds.
   */
  readonly skipLikePairs?: boolean;
};

export function perceiveBonds(
  atoms: readonly Atom[],
  positions: Float64Array,
  options: BondPerceptionOptions = {},
): Bond[] {
  const n = atoms.length;
  const bonds: Bond[] = [];
  if (n === 0) {
    return bonds;
  }
  let maxRadius = 0;
  for (const atom of atoms) {
    maxRadius = Math.max(maxRadius, atom.element.covalentRadius);
  }
  const cellSize = 2 * maxRadius + BOND_TOLERANCE;
  const multipleElements = new Set(atoms.map((atom) => atom.element.number)).size > 1;
  const skipLike = options.skipLikePairs === true && multipleElements;
  const skipCations = skipLike && atoms.some((atom) => atom.element.electronegativity >= ANION_ELECTRONEGATIVITY);
  const isCation = (atom: Atom) => atom.element.electronegativity < ANION_ELECTRONEGATIVITY;

  const grid = new Map<string, number[]>();
  const keyOf = (i: number, j: number, k: number) => `${i},${j},${k}`;
  const cellOf = (index: number): [number, number, number] => [
    Math.floor((positions[3 * index] ?? 0) / cellSize),
    Math.floor((positions[3 * index + 1] ?? 0) / cellSize),
    Math.floor((positions[3 * index + 2] ?? 0) / cellSize),
  ];
  for (let index = 0; index < n; index++) {
    const [i, j, k] = cellOf(index);
    const key = keyOf(i, j, k);
    const bucket = grid.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      grid.set(key, [index]);
    }
  }

  for (let a = 0; a < n; a++) {
    const atomA = atoms[a];
    if (!atomA) {
      continue;
    }
    const [i, j, k] = cellOf(a);
    const ax = positions[3 * a] ?? 0;
    const ay = positions[3 * a + 1] ?? 0;
    const az = positions[3 * a + 2] ?? 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (let dk = -1; dk <= 1; dk++) {
          const bucket = grid.get(keyOf(i + di, j + dj, k + dk));
          if (!bucket) {
            continue;
          }
          for (const b of bucket) {
            if (b <= a) {
              continue;
            }
            const atomB = atoms[b];
            if (
              !atomB ||
              (skipLike && atomA.element === atomB.element) ||
              (skipCations && isCation(atomA) && isCation(atomB))
            ) {
              continue;
            }
            const dx = (positions[3 * b] ?? 0) - ax;
            const dy = (positions[3 * b + 1] ?? 0) - ay;
            const dz = (positions[3 * b + 2] ?? 0) - az;
            const d2 = dx * dx + dy * dy + dz * dz;
            const cutoff = atomA.element.covalentRadius + atomB.element.covalentRadius + BOND_TOLERANCE;
            if (d2 < cutoff * cutoff && d2 > MIN_BOND_DISTANCE * MIN_BOND_DISTANCE) {
              // Hydrogens bond to at most their nearest heavy partner; skip H–H unless H2.
              if (atomA.element.number === 1 && atomB.element.number === 1 && n > 2) {
                continue;
              }
              bonds.push({ a, b, order: 1 });
            }
          }
        }
      }
    }
  }
  return bonds;
}
