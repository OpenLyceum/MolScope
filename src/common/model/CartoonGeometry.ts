/**
 * CartoonGeometry.ts
 *
 * Smooth polymer paths for cartoon, trace and backbone rendering. For each chain
 * run of consecutive residues (Cα for proteins, P for nucleic acids) it fits a
 * Catmull–Rom spline, carries an orientation ("guide") vector along it — Cα→O for
 * proteins, which is what makes helices and sheets read as flat ribbons — and
 * assigns a ribbon half-width per sample from the secondary structure, including
 * the tapering arrowhead at the end of each β-strand.
 *
 * Pure geometry in model space (Å); the renderer only rotates and projects.
 */

import type { Vec3 } from "./Geometry.js";
import { cross, dot, normalize, subtract } from "./Geometry.js";
import type { Structure } from "./Structure.js";
import { ResidueKind, SecondaryStructure } from "./Structure.js";

/** Spline samples per residue interval. */
export const SAMPLES_PER_RESIDUE = 6;

/** Ribbon half-widths, Å. */
export const HELIX_HALF_WIDTH = 1.25;
export const SHEET_HALF_WIDTH = 1.1;
export const ARROW_HALF_WIDTH = 1.8;
/** Tube radius for coils, traces and nucleic backbones, Å. */
export const TUBE_RADIUS = 0.3;

/** Largest lead-atom gap still drawn as connected, Å (Cα–Cα is 3.8, P–P about 7). */
const MAX_PROTEIN_GAP = 4.5;
const MAX_NUCLEIC_GAP = 8.5;

export type PolymerPath = {
  /** Sample positions, xyz interleaved. */
  readonly points: Float64Array;
  /** Unit guide (ribbon-width direction) per sample. */
  readonly guides: Float64Array;
  /** Unit ribbon normal per sample (tangent × guide). */
  readonly normals: Float64Array;
  /** Ribbon half-width per sample, Å; 0 means draw a tube. */
  readonly halfWidths: Float64Array;
  /** Residue index each sample belongs to (for colour and visibility). */
  readonly residues: Int32Array;
  readonly isNucleic: boolean;
};

export function buildPolymerPaths(structure: Structure, positions: Float64Array): PolymerPath[] {
  const paths: PolymerPath[] = [];
  const residues = structure.residues;
  const pos = (atom: number): Vec3 => [
    positions[3 * atom] ?? 0,
    positions[3 * atom + 1] ?? 0,
    positions[3 * atom + 2] ?? 0,
  ];

  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) {
      paths.push(buildPath(structure, run, pos));
    }
    run = [];
  };
  for (let r = 0; r < residues.length; r++) {
    const residue = residues[r];
    if (
      !residue ||
      residue.leadAtom < 0 ||
      (residue.kind !== ResidueKind.AMINO && residue.kind !== ResidueKind.NUCLEIC)
    ) {
      flush();
      continue;
    }
    const previous = residues[run[run.length - 1] ?? -1];
    if (previous) {
      const gap = Math.hypot(...subtract(pos(residue.leadAtom), pos(previous.leadAtom)));
      const limit = residue.kind === ResidueKind.NUCLEIC ? MAX_NUCLEIC_GAP : MAX_PROTEIN_GAP;
      if (previous.chain !== residue.chain || previous.kind !== residue.kind || gap > limit) {
        flush();
      }
    }
    run.push(r);
  }
  flush();
  return paths;
}

function buildPath(structure: Structure, run: readonly number[], pos: (atom: number) => Vec3): PolymerPath {
  const residues = structure.residues;
  const isNucleic = residues[run[0] ?? 0]?.kind === ResidueKind.NUCLEIC;
  const control = run.map((r) => pos(residues[r]?.leadAtom ?? 0));

  // Guide vectors per residue, sign-aligned so sheets do not twist at every residue.
  const guides: Vec3[] = [];
  run.forEach((r, k) => {
    const residue = residues[r];
    const here = control[k] ?? [0, 0, 0];
    const tangent = normalize(
      subtract(control[Math.min(k + 1, run.length - 1)] ?? here, control[Math.max(k - 1, 0)] ?? here),
    );
    let g: Vec3 = residue && residue.guideAtom >= 0 ? subtract(pos(residue.guideAtom), here) : [0, 0, 1];
    g = normalize(subtract(g, scaleVec(tangent, dot(g, tangent))));
    if (g[0] === 0 && g[1] === 0 && g[2] === 0) {
      g = normalize(cross(tangent, [0, 0, 1]));
    }
    const previous = guides[k - 1];
    if (previous && dot(previous, g) < 0) {
      g = scaleVec(g, -1);
    }
    guides.push(g);
  });

  const ssOf = (k: number) => structure.atoms[residues[run[k] ?? 0]?.leadAtom ?? 0]?.secondaryStructure ?? 0;
  const intervals = run.length - 1;
  const count = intervals * SAMPLES_PER_RESIDUE + 1;
  const points = new Float64Array(3 * count);
  const guideOut = new Float64Array(3 * count);
  const normals = new Float64Array(3 * count);
  const halfWidths = new Float64Array(count);
  const residueOut = new Int32Array(count);

  for (let s = 0; s < count; s++) {
    const k = Math.min(Math.floor(s / SAMPLES_PER_RESIDUE), intervals - 1);
    const t = (s - k * SAMPLES_PER_RESIDUE) / SAMPLES_PER_RESIDUE;
    const p0 = control[Math.max(k - 1, 0)] ?? [0, 0, 0];
    const p1 = control[k] ?? p0;
    const p2 = control[k + 1] ?? p1;
    const p3 = control[Math.min(k + 2, run.length - 1)] ?? p2;
    const p = catmullRom(p0, p1, p2, p3, t);
    const tangent = normalize(catmullRomTangent(p0, p1, p2, p3, t));
    const g0 = guides[k] ?? [0, 0, 1];
    const g1 = guides[k + 1] ?? g0;
    let g: Vec3 = [g0[0] * (1 - t) + g1[0] * t, g0[1] * (1 - t) + g1[1] * t, g0[2] * (1 - t) + g1[2] * t];
    g = normalize(subtract(g, scaleVec(tangent, dot(g, tangent))));
    const n = normalize(cross(tangent, g));
    points.set(p, 3 * s);
    guideOut.set(g, 3 * s);
    normals.set(n, 3 * s);

    // Interval k takes the secondary structure of its starting residue.
    const ss = ssOf(k);
    let w = 0;
    if (!isNucleic) {
      if (ss === SecondaryStructure.HELIX) {
        w = HELIX_HALF_WIDTH;
      } else if (ss === SecondaryStructure.SHEET) {
        const strandEnds = ssOf(k + 1) !== SecondaryStructure.SHEET || k + 1 === intervals;
        w = strandEnds ? ARROW_HALF_WIDTH * (1 - t) + TUBE_RADIUS * t : SHEET_HALF_WIDTH;
      }
    }
    halfWidths[s] = w;
    // Colour follows the nearest residue so colour boundaries sit midway between Cα atoms.
    const owner = s === count - 1 ? intervals : t < 0.5 ? k : k + 1;
    residueOut[s] = run[owner] ?? 0;
  }
  return { points, guides: guideOut, normals, halfWidths, residues: residueOut, isNucleic };
}

function scaleVec(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a = p0[i] ?? 0;
    const b = p1[i] ?? 0;
    const c = p2[i] ?? 0;
    const d = p3[i] ?? 0;
    out[i] = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  }
  return out;
}

function catmullRomTangent(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a = p0[i] ?? 0;
    const b = p1[i] ?? 0;
    const c = p2[i] ?? 0;
    const d = p3[i] ?? 0;
    out[i] = 0.5 * (-a + c + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t2);
  }
  return out;
}
