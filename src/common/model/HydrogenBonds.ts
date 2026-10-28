/**
 * HydrogenBonds.ts
 *
 * A geometric hydrogen-bond finder in the spirit of Jmol's `hbonds calculate`:
 * a donor–acceptor pair of N/O atoms 2.5–3.5 Å apart, not covalently bonded and not
 * in the same residue (or, for small molecules, not sharing a neighbour). Works
 * without explicit hydrogens, which most crystal structures lack.
 */

import type { Bond, Structure } from "./Structure.js";

export const HBOND_MIN_DISTANCE = 2.5; // Å
export const HBOND_MAX_DISTANCE = 3.5; // Å

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
    const [gx = 0, gy = 0, gz = 0] = key(a);
    const atomA = structure.atoms[a];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const b of grid.get(`${gx + dx},${gy + dy},${gz + dz}`) ?? []) {
            if (b <= a) {
              continue;
            }
            const atomB = structure.atoms[b];
            if (!(atomA && atomB)) {
              continue;
            }
            if (atomA.residueIndex >= 0 && atomA.residueIndex === atomB.residueIndex) {
              continue;
            }
            const na = neighbors.get(a);
            const nb = neighbors.get(b);
            if (na?.has(b) || (na && nb && [...na].some((x) => nb.has(x)))) {
              continue;
            }
            const ddx = (positions[3 * a] ?? 0) - (positions[3 * b] ?? 0);
            const ddy = (positions[3 * a + 1] ?? 0) - (positions[3 * b + 1] ?? 0);
            const ddz = (positions[3 * a + 2] ?? 0) - (positions[3 * b + 2] ?? 0);
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 >= min2 && d2 <= max2) {
              out.push({ a, b, order: 0 });
            }
          }
        }
      }
    }
  }
  return out;
}
