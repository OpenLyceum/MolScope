/**
 * Polyhedra.ts
 *
 * Coordination polyhedra for crystal structures (Jmol's `polyhedra` command): around
 * each cation — an atom less electronegative than all of its bonded neighbours, with
 * 4 to 12 of them — build the convex hull of the neighbours. TiO₆ octahedra in
 * perovskite and rutile, SiO₄ tetrahedra in quartz, NaCl₆ octahedra in rock salt.
 *
 * When several cations qualify, only those with the smallest coordination number are
 * kept (TiO₆ rather than CaO₁₂ in perovskite).
 *
 * Cations on the edge of the packed block have an incomplete shell; only polyhedra
 * with the full (most common) coordination number for their element are kept.
 */

import type { Structure } from "./Structure.js";

export type Polyhedron = {
  readonly center: number;
  /** Triangular faces as atom-index triples, outward-wound. */
  readonly faces: readonly (readonly [number, number, number])[];
};

const MIN_COORDINATION = 4;
const MAX_COORDINATION = 12;

export function findPolyhedra(structure: Structure, positions: Float64Array): Polyhedron[] {
  const neighbors: number[][] = structure.atoms.map(() => []);
  for (const bond of structure.bonds) {
    neighbors[bond.a]?.push(bond.b);
    neighbors[bond.b]?.push(bond.a);
  }
  const candidates: number[] = [];
  structure.atoms.forEach((atom, i) => {
    const list = neighbors[i] ?? [];
    if (list.length < MIN_COORDINATION || list.length > MAX_COORDINATION) {
      return;
    }
    const en = atom.element.electronegativity;
    if (list.every((j) => (structure.atoms[j]?.element.electronegativity ?? 0) > en)) {
      candidates.push(i);
    }
  });

  // Most common coordination number per element.
  const tallies = new Map<number, Map<number, number>>();
  for (const i of candidates) {
    const z = structure.atoms[i]?.element.number ?? 0;
    const cn = neighbors[i]?.length ?? 0;
    const t = tallies.get(z) ?? new Map<number, number>();
    t.set(cn, (t.get(cn) ?? 0) + 1);
    tallies.set(z, t);
  }
  const fullShell = new Map<number, number>();
  for (const [z, t] of tallies) {
    // The largest CN seen is the complete shell; smaller ones are cut by the cell boundary.
    fullShell.set(z, Math.max(...t.keys()));
  }
  // With several cation types (Ca and Ti in perovskite), show the tighter framework
  // polyhedra — the smallest coordination number — as Jmol users usually ask for.
  const frameworkShell = Math.min(...fullShell.values());
  for (const [z, cn] of fullShell) {
    if (cn !== frameworkShell) {
      fullShell.delete(z);
    }
  }

  const out: Polyhedron[] = [];
  for (const center of candidates) {
    const z = structure.atoms[center]?.element.number ?? 0;
    const list = neighbors[center] ?? [];
    if (list.length !== fullShell.get(z)) {
      continue;
    }
    const faces = convexHullFaces(list, positions, center);
    if (faces.length > 0) {
      out.push({ center, faces });
    }
  }
  return out;
}

/** Brute-force hull of ≤ 12 points: a triangle is a face if every other point lies on one side. */
function convexHullFaces(points: readonly number[], p: Float64Array, center: number): [number, number, number][] {
  const get = (i: number) => [p[3 * i] ?? 0, p[3 * i + 1] ?? 0, p[3 * i + 2] ?? 0] as const;
  const c = get(center);
  const faces: [number, number, number][] = [];
  const eps = 1e-3;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      for (let k = j + 1; k < points.length; k++) {
        const ia = points[i] ?? 0;
        const ib = points[j] ?? 0;
        const ic = points[k] ?? 0;
        const a = get(ia);
        const b = get(ib);
        const d = get(ic);
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        const n = [
          (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
          (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
          (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
        ];
        const side = (q: readonly number[]) =>
          (n[0] ?? 0) * ((q[0] ?? 0) - a[0]) + (n[1] ?? 0) * ((q[1] ?? 0) - a[1]) + (n[2] ?? 0) * ((q[2] ?? 0) - a[2]);
        let positive = 0;
        let negative = 0;
        for (const other of points) {
          if (other === ia || other === ib || other === ic) {
            continue;
          }
          const s = side(get(other));
          if (s > eps) {
            positive++;
          } else if (s < -eps) {
            negative++;
          }
        }
        if (positive > 0 && negative > 0) {
          continue;
        }
        // Skip coplanar duplicates (a square face yields two triangles plus two degenerate ones).
        if (faces.some((f) => f.includes(ia) && f.includes(ib) && f.includes(ic))) {
          continue;
        }
        // Wind outward: the centre must be on the negative side.
        faces.push(side(c) > 0 ? [ia, ic, ib] : [ia, ib, ic]);
      }
    }
  }
  return faces;
}
