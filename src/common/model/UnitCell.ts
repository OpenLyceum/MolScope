/**
 * UnitCell.ts
 *
 * Crystal cell geometry and symmetry. Converts cell parameters (a, b, c, α, β, γ)
 * into the fractional→Cartesian matrix (a along x, b in the xy plane — the
 * standard PDB/CIF orthogonalisation), parses symmetry operators written as
 * "x,y,z" / "-y,x-y,1/3+z", and packs the asymmetric unit into one or more cells
 * the way Jmol's `load file {n m l}` does.
 */

import type { Vec3 } from "./Geometry.js";

export type CellParameters = {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  /** Degrees. */
  readonly alpha: number;
  readonly beta: number;
  readonly gamma: number;
};

/** One symmetry operation: f' = R f + t on fractional coordinates. */
export type SymmetryOperator = {
  readonly rotation: readonly number[]; // row-major 3×3
  readonly translation: Vec3;
};

/** Fractional-coordinate tolerance for deduplication and cell-face inclusion. */
const FRACTIONAL_TOLERANCE = 0.01;

export class UnitCell {
  public readonly parameters: CellParameters;
  public readonly spaceGroup: string;
  /** Columns are the cell vectors a, b, c in Cartesian Å (row-major storage). */
  private readonly matrix: readonly number[];

  public constructor(parameters: CellParameters, spaceGroup = "") {
    this.parameters = parameters;
    this.spaceGroup = spaceGroup;
    const { a, b, c } = parameters;
    const toRad = Math.PI / 180;
    const ca = Math.cos(parameters.alpha * toRad);
    const cb = Math.cos(parameters.beta * toRad);
    const cg = Math.cos(parameters.gamma * toRad);
    const sg = Math.sin(parameters.gamma * toRad);
    const cx = c * cb;
    const cy = (c * (ca - cb * cg)) / sg;
    const cz = Math.sqrt(Math.max(0, c * c - cx * cx - cy * cy));
    this.matrix = [a, b * cg, cx, 0, b * sg, cy, 0, 0, cz];
  }

  /** Fractional → Cartesian Å. */
  public toCartesian(f: Vec3): Vec3 {
    const m = this.matrix;
    return [
      (m[0] ?? 0) * f[0] + (m[1] ?? 0) * f[1] + (m[2] ?? 0) * f[2],
      (m[3] ?? 0) * f[0] + (m[4] ?? 0) * f[1] + (m[5] ?? 0) * f[2],
      (m[6] ?? 0) * f[0] + (m[7] ?? 0) * f[1] + (m[8] ?? 0) * f[2],
    ];
  }

  /** Cartesian Å → fractional (inverts the upper-triangular matrix). */
  public toFractional(p: Vec3): Vec3 {
    const m = this.matrix;
    const m00 = m[0] ?? 1;
    const m01 = m[1] ?? 0;
    const m02 = m[2] ?? 0;
    const m11 = m[4] ?? 1;
    const m12 = m[5] ?? 0;
    const m22 = m[8] ?? 1;
    const fz = p[2] / m22;
    const fy = (p[1] - m12 * fz) / m11;
    const fx = (p[0] - m01 * fy - m02 * fz) / m00;
    return [fx, fy, fz];
  }

  /** The 8 Cartesian corners of a block of `range` cells, ordered by binary (i, j, k). */
  public corners(range: Vec3 = [1, 1, 1]): Vec3[] {
    const out: Vec3[] = [];
    for (let i = 0; i < 8; i++) {
      out.push(this.toCartesian([i & 1 ? range[0] : 0, i & 2 ? range[1] : 0, i & 4 ? range[2] : 0]));
    }
    return out;
  }

  /** Cell volume, Å³. */
  public volume(): number {
    const m = this.matrix;
    return (m[0] ?? 0) * (m[4] ?? 0) * (m[8] ?? 0);
  }
}

/** The 12 edges of a box given its {@link UnitCell.corners} indices. */
export const CELL_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * Parses one symmetry operator such as "x,y,z", "-y, x-y, z+1/3" or "1/2+x,-y,z".
 * Returns null on anything it does not understand.
 */
export function parseSymmetryOperator(text: string): SymmetryOperator | null {
  const parts = text
    .replace(/['"\s]/g, "")
    .toLowerCase()
    .split(",");
  if (parts.length !== 3) {
    return null;
  }
  const rotation: number[] = [];
  const translation: Vec3 = [0, 0, 0];
  for (let row = 0; row < 3; row++) {
    const expr = parts[row] ?? "";
    const coefficients = [0, 0, 0];
    let constant = 0;
    const terms = expr.match(/[+-]?[^+-]+/g);
    if (!terms) {
      return null;
    }
    for (const term of terms) {
      const sign = term.startsWith("-") ? -1 : 1;
      const body = term.replace(/^[+-]/, "");
      const axis = body.search(/[xyz]/);
      if (axis >= 0) {
        const variable = body[axis] ?? "x";
        const factorText = body.replace(/[xyz*]/g, "");
        const factor = factorText === "" ? 1 : parseFraction(factorText);
        if (factor === null) {
          return null;
        }
        coefficients["xyz".indexOf(variable)] = sign * factor;
      } else {
        const value = parseFraction(body);
        if (value === null) {
          return null;
        }
        constant += sign * value;
      }
    }
    rotation.push(...coefficients);
    translation[row] = constant;
  }
  return { rotation, translation };
}

function parseFraction(text: string): number | null {
  if (text.includes("/")) {
    const [n, d] = text.split("/");
    const value = Number(n) / Number(d);
    return Number.isFinite(value) ? value : null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function applyOperator(op: SymmetryOperator, f: Vec3): Vec3 {
  const r = op.rotation;
  return [
    (r[0] ?? 0) * f[0] + (r[1] ?? 0) * f[1] + (r[2] ?? 0) * f[2] + op.translation[0],
    (r[3] ?? 0) * f[0] + (r[4] ?? 0) * f[1] + (r[5] ?? 0) * f[2] + op.translation[1],
    (r[6] ?? 0) * f[0] + (r[7] ?? 0) * f[1] + (r[8] ?? 0) * f[2] + op.translation[2],
  ];
}

/** An asymmetric-unit site to be packed. */
export type CellSite<T> = {
  readonly fractional: Vec3;
  readonly data: T;
};

/**
 * Applies every symmetry operator to every site, wraps into [0, 1), removes
 * duplicates, and replicates over `range` cells — including atoms that sit exactly
 * on the far faces, so a 1×1×1 NaCl cell shows all 27 sites like Jmol's `packed`.
 */
export function packCell<T>(
  sites: readonly CellSite<T>[],
  operators: readonly SymmetryOperator[],
  range: Vec3,
): CellSite<T>[] {
  const ops = operators.length > 0 ? operators : [{ rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] }];
  const unique: CellSite<T>[] = [];
  for (const site of sites) {
    const local: Vec3[] = [];
    for (const op of ops as readonly SymmetryOperator[]) {
      const f = applyOperator(op, site.fractional).map(wrap01) as Vec3;
      if (!local.some((g) => fractionalClose(f, g))) {
        local.push(f);
      }
    }
    for (const f of local) {
      if (!unique.some((u) => fractionalClose(u.fractional, f))) {
        unique.push({ fractional: f, data: site.data });
      }
    }
  }

  const packed: CellSite<T>[] = [];
  for (const site of unique) {
    const [fx, fy, fz] = site.fractional;
    for (let i = 0; i <= range[0]; i++) {
      for (let j = 0; j <= range[1]; j++) {
        for (let k = 0; k <= range[2]; k++) {
          const g: Vec3 = [fx + i, fy + j, fz + k];
          if (
            g[0] <= range[0] + FRACTIONAL_TOLERANCE &&
            g[1] <= range[1] + FRACTIONAL_TOLERANCE &&
            g[2] <= range[2] + FRACTIONAL_TOLERANCE
          ) {
            packed.push({ fractional: g, data: site.data });
          }
        }
      }
    }
  }
  return packed;
}

function wrap01(v: number): number {
  let w = v - Math.floor(v);
  if (w > 1 - FRACTIONAL_TOLERANCE) {
    w = 0;
  }
  return Math.abs(w) < 1e-9 ? 0 : w;
}

/** Fractional points equal modulo lattice translations. */
function fractionalClose(a: Vec3, b: Vec3): boolean {
  for (let i = 0; i < 3; i++) {
    let d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    d = Math.min(d, 1 - d);
    if (d > FRACTIONAL_TOLERANCE) {
      return false;
    }
  }
  return true;
}
