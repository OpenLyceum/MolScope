/**
 * MoleculeRenderer.ts
 *
 * A painter's-algorithm renderer for the 3D viewer, drawing straight to a 2D canvas
 * context — the same strategy as Jmol's own software renderer. Every frame it
 * rotates and projects the atoms, builds one list of depth-tagged primitives
 * (shaded spheres, cylinder halves, ribbon quads, tubes, polyhedron faces, dashed
 * hydrogen bonds), sorts it back to front, and paints. Overlays (labels,
 * measurements, halos, the unit cell, the axis gizmo) go on top.
 *
 * Spheres are drawn from pre-shaded sprites cached per colour, which keeps a
 * 5000-atom protein in space-fill interactive. The renderer keeps the last
 * projection so the view can hit-test atoms under the pointer.
 */

import type { PolymerPath } from "../model/CartoonGeometry.js";
import { TUBE_RADIUS } from "../model/CartoonGeometry.js";
import type { DisplayState } from "../model/DisplayState.js";
import { WIREFRAME_LINE } from "../model/DisplayState.js";
import type { Vec3 } from "../model/Geometry.js";
import type { Polyhedron } from "../model/Polyhedra.js";
import type { Rotation3 } from "../model/Rotation3.js";
import type { Bond } from "../model/Structure.js";
import { ResidueKind } from "../model/Structure.js";
import type { UnitCell } from "../model/UnitCell.js";
import { CELL_EDGES } from "../model/UnitCell.js";
import type { Measurement } from "../model/ViewerModel.js";

/** Camera distance in units of the bounding radius (Jmol's default `cameraDepth` is 3). */
const CAMERA_DEPTH = 3;
/** Sprite resolution for shaded spheres, px. */
const SPRITE_SIZE = 128;
/** Sprites kept before the cache is flushed (continuous colour schemes create many). */
const MAX_SPRITES = 512;
/** Thin wireframe line width, px. */
const WIRE_WIDTH = 1.6;
/** Minimum pick radius, px, so thin wireframe atoms are still clickable. */
const MIN_PICK_RADIUS = 6;

const Kind = {
  SPHERE: 0,
  CYLINDER: 1,
  LINE: 2,
  QUAD: 3,
  TUBE: 4,
  FACE: 5,
  DASH: 6,
} as const;

/** One depth-sorted primitive; pooled and reused between frames. */
type Item = {
  kind: number;
  z: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
  /** Radius (sphere), width (cylinder, line, tube) in px. */
  size: number;
  color: number;
  /** Lambert brightness 0–1 for flat primitives. */
  shade: number;
};

export type OverlayColors = {
  readonly label: string;
  readonly measurement: string;
  readonly unitCell: string;
  readonly halo: string;
  readonly hover: string;
  readonly pick: string;
  readonly hydrogenBond: string;
  readonly axisX: string;
  readonly axisY: string;
  readonly axisZ: string;
};

export type RenderInput = {
  readonly width: number;
  readonly height: number;
  readonly state: DisplayState;
  readonly positions: Float64Array;
  readonly rotation: Rotation3;
  readonly center: Vec3;
  readonly radius: number;
  readonly zoom: number;
  readonly perspective: boolean;
  /** Fill colour 0xRRGGBB, or null to leave the canvas transparent. */
  readonly background: number | null;
  readonly paths: readonly PolymerPath[];
  readonly hydrogenBonds: readonly Bond[] | null;
  readonly polyhedra: readonly Polyhedron[] | null;
  readonly unitCell: UnitCell | null;
  readonly cellRange: Vec3;
  readonly showAxes: boolean;
  readonly showHalos: boolean;
  readonly hovered: number | null;
  readonly picked: number | null;
  readonly pendingPicks: readonly number[];
  readonly measurements: readonly Measurement[];
  readonly measurementLabel: (measurement: Measurement) => string;
  readonly axisLabels: readonly [string, string, string];
  readonly cellLabels: readonly [string, string, string, string];
  readonly colors: OverlayColors;
  readonly font: string;
};

export class MoleculeRenderer {
  private items: Item[] = [];
  private itemCount = 0;
  private order: number[] = [];
  private readonly sprites = new Map<number, HTMLCanvasElement>();
  private readonly cssCache = new Map<number, string>();

  // Last projection, for picking.
  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  private sz = new Float32Array(0);
  private sr = new Float32Array(0);
  private pickable = new Uint8Array(0);
  private scale = 1;
  private cx = 0;
  private cy = 0;
  private depth = 1;
  private perspective = true;
  private input: RenderInput | null = null;

  /** Pixels per Å at the rotation centre for the last frame. */
  public get pixelsPerAngstrom(): number {
    return this.scale;
  }

  public render(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    this.input = input;
    const { width, height, state } = input;
    if (input.background !== null) {
      ctx.fillStyle = this.css(input.background);
      ctx.fillRect(0, 0, width, height);
    }
    this.project(input);
    this.itemCount = 0;
    this.addAtomsAndBonds(input);
    this.addPolymers(input);
    if (input.hydrogenBonds) {
      this.addHydrogenBonds(input.hydrogenBonds, state);
    }
    if (input.polyhedra) {
      this.addPolyhedra(input.polyhedra, input);
    }
    this.paintItems(ctx);
    if (input.unitCell) {
      this.paintUnitCell(ctx, input.unitCell, input);
    }
    this.paintOverlays(ctx, input);
    if (input.showAxes) {
      this.paintAxes(ctx, input);
    }
  }

  /** Front-most atom whose disc contains (x, y), or null. */
  public pick(x: number, y: number): number | null {
    let best: number | null = null;
    let bestZ = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < this.sx.length; i++) {
      if (!this.pickable[i]) {
        continue;
      }
      const r = Math.max(this.sr[i] ?? 0, MIN_PICK_RADIUS);
      const dx = (this.sx[i] ?? 0) - x;
      const dy = (this.sy[i] ?? 0) - y;
      if (dx * dx + dy * dy <= r * r && (this.sz[i] ?? 0) > bestZ) {
        best = i;
        bestZ = this.sz[i] ?? 0;
      }
    }
    return best;
  }

  /** Screen position of atom i from the last frame. */
  public screenPosition(i: number): { x: number; y: number } | null {
    return i >= 0 && i < this.sx.length ? { x: this.sx[i] ?? 0, y: this.sy[i] ?? 0 } : null;
  }

  /** Cartesian Å displacement (model frame) for a screen-space drag of (dx, dy) px. */
  public screenDeltaToModel(dx: number, dy: number, rotation: Rotation3): Vec3 {
    const m = rotation.m;
    const vx = dx / this.scale;
    const vy = -dy / this.scale;
    // Transpose of the rotation maps view axes back to model axes.
    return [
      (m[0] ?? 0) * vx + (m[3] ?? 0) * vy,
      (m[1] ?? 0) * vx + (m[4] ?? 0) * vy,
      (m[2] ?? 0) * vx + (m[5] ?? 0) * vy,
    ];
  }

  // ── Projection ───────────────────────────────────────────────────────────────

  private project(input: RenderInput): void {
    const { state, positions, rotation, center, width, height } = input;
    const n = state.atomCount;
    if (this.sx.length !== n) {
      this.sx = new Float32Array(n);
      this.sy = new Float32Array(n);
      this.sz = new Float32Array(n);
      this.sr = new Float32Array(n);
      this.pickable = new Uint8Array(n);
    }
    this.cx = width / 2;
    this.cy = height / 2;
    this.scale = (input.zoom * Math.min(width, height)) / 2 / (input.radius * 1.05);
    this.depth = CAMERA_DEPTH * input.radius;
    this.perspective = input.perspective;
    const v: Vec3 = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      rotation.apply(
        (positions[3 * i] ?? 0) - center[0],
        (positions[3 * i + 1] ?? 0) - center[1],
        (positions[3 * i + 2] ?? 0) - center[2],
        v,
      );
      const f = this.perspectiveFactor(v[2]);
      this.sx[i] = this.cx + v[0] * this.scale * f;
      this.sy[i] = this.cy - v[1] * this.scale * f;
      this.sz[i] = v[2];
      this.sr[i] = (state.atomRadius[i] ?? 0) * this.scale * f;
      this.pickable[i] = state.isDisplayed(i) ? 1 : 0;
    }
  }

  private perspectiveFactor(z: number): number {
    if (!this.perspective) {
      return 1;
    }
    return this.depth / Math.max(this.depth - z, this.depth * 0.1);
  }

  /** Projects a model-space point (Å) to [x, y, z]. */
  private projectPoint(p: Vec3, input: RenderInput): Vec3 {
    const v: Vec3 = [0, 0, 0];
    input.rotation.apply(p[0] - input.center[0], p[1] - input.center[1], p[2] - input.center[2], v);
    const f = this.perspectiveFactor(v[2]);
    return [this.cx + v[0] * this.scale * f, this.cy - v[1] * this.scale * f, v[2]];
  }

  // ── Building the item list ────────────────────────────────────────────────────

  private item(kind: number, z: number): Item {
    let it = this.items[this.itemCount];
    if (!it) {
      it = { kind, z, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0, size: 0, color: 0, shade: 1 };
      this.items.push(it);
    }
    it.kind = kind;
    it.z = z;
    it.shade = 1;
    this.itemCount++;
    return it;
  }

  private addAtomsAndBonds(input: RenderInput): void {
    const { state } = input;
    const n = state.atomCount;
    for (let i = 0; i < n; i++) {
      if (state.hidden[i] || (this.sr[i] ?? 0) <= 0) {
        continue;
      }
      const it = this.item(Kind.SPHERE, this.sz[i] ?? 0);
      it.x1 = this.sx[i] ?? 0;
      it.y1 = this.sy[i] ?? 0;
      it.size = this.sr[i] ?? 0;
      it.color = state.colors[i] ?? 0;
    }
    for (const bond of state.structure.bonds) {
      this.addBond(bond, input);
    }
  }

  private addBond(bond: Bond, input: RenderInput): void {
    const { state } = input;
    const { a, b } = bond;
    if (state.hidden[a] || state.hidden[b]) {
      return;
    }
    const ra = state.bondRadius[a] ?? 0;
    const rb = state.bondRadius[b] ?? 0;
    if (ra === 0 || rb === 0) {
      return;
    }
    const line = ra === WIREFRAME_LINE || rb === WIREFRAME_LINE;
    const radius = line ? 0 : Math.min(ra, rb);
    const ax = this.sx[a] ?? 0;
    const ay = this.sy[a] ?? 0;
    const bx = this.sx[b] ?? 0;
    const by = this.sy[b] ?? 0;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) {
      return;
    }
    const f = this.perspectiveFactor(((this.sz[a] ?? 0) + (this.sz[b] ?? 0)) / 2);
    const width = line ? WIRE_WIDTH : 2 * radius * this.scale * f;
    // Start each half at the sphere surface so it does not paint over the ball's face.
    const trimA = Math.min(0.45, Math.sqrt(Math.max(0, (this.sr[a] ?? 0) ** 2 - (width / 2) ** 2)) / len);
    const trimB = Math.min(0.45, Math.sqrt(Math.max(0, (this.sr[b] ?? 0) ** 2 - (width / 2) ** 2)) / len);
    const order = Math.round(bond.order);
    const multiple = order >= 2 || bond.order === 1.5 ? (bond.order === 1.5 ? 2 : order) : 1;
    const strandWidth = multiple > 1 ? width / (line ? 1 : multiple * 0.8) : width;
    const spacing = multiple > 1 ? Math.max(strandWidth * 1.3, line ? 3.5 : 0) : 0;
    const px = (-dy / len) * spacing;
    const py = (dx / len) * spacing;
    const ca = state.colors[a] ?? 0;
    const cb = state.colors[b] ?? 0;
    for (let s = 0; s < multiple; s++) {
      const offset = s - (multiple - 1) / 2;
      const ox = px * offset;
      const oy = py * offset;
      const x1 = ax + dx * trimA + ox;
      const y1 = ay + dy * trimA + oy;
      const x2 = bx - dx * trimB + ox;
      const y2 = by - dy * trimB + oy;
      const mx = (ax + bx) / 2 + ox;
      const my = (ay + by) / 2 + oy;
      const kind = line ? Kind.LINE : Kind.CYLINDER;
      // The second strand of an aromatic bond is drawn thinner, like Jmol's dashed partial bond.
      const w = bond.order === 1.5 && s === 1 ? strandWidth * 0.55 : strandWidth;
      if (ca === cb) {
        const it = this.item(kind, ((this.sz[a] ?? 0) + (this.sz[b] ?? 0)) / 2);
        Object.assign(it, { x1, y1, x2, y2, size: w, color: ca });
      } else {
        const h1 = this.item(kind, (3 * (this.sz[a] ?? 0) + (this.sz[b] ?? 0)) / 4);
        Object.assign(h1, { x1, y1, x2: mx, y2: my, size: w, color: ca });
        const h2 = this.item(kind, ((this.sz[a] ?? 0) + 3 * (this.sz[b] ?? 0)) / 4);
        Object.assign(h2, { x1: mx, y1: my, x2, y2, size: w, color: cb });
      }
    }
  }

  private addPolymers(input: RenderInput): void {
    const { state } = input;
    const structure = state.structure;
    for (const path of input.paths) {
      const count = path.halfWidths.length;
      const projected = new Float64Array(3 * count);
      const factor = new Float64Array(count);
      const nz = new Float64Array(count);
      const gx = new Float64Array(count);
      const gy = new Float64Array(count);
      const v: Vec3 = [0, 0, 0];
      for (let s = 0; s < count; s++) {
        input.rotation.apply(
          (path.points[3 * s] ?? 0) - input.center[0],
          (path.points[3 * s + 1] ?? 0) - input.center[1],
          (path.points[3 * s + 2] ?? 0) - input.center[2],
          v,
        );
        const f = this.perspectiveFactor(v[2]);
        factor[s] = f;
        projected[3 * s] = this.cx + v[0] * this.scale * f;
        projected[3 * s + 1] = this.cy - v[1] * this.scale * f;
        projected[3 * s + 2] = v[2];
        input.rotation.apply(path.guides[3 * s] ?? 0, path.guides[3 * s + 1] ?? 0, path.guides[3 * s + 2] ?? 0, v);
        gx[s] = v[0];
        gy[s] = -v[1];
        input.rotation.apply(path.normals[3 * s] ?? 0, path.normals[3 * s + 1] ?? 0, path.normals[3 * s + 2] ?? 0, v);
        nz[s] = v[2];
      }
      for (let s = 0; s + 1 < count; s++) {
        const residue = structure.residues[path.residues[s] ?? 0];
        const lead = residue?.leadAtom ?? -1;
        if (lead < 0 || state.hidden[lead]) {
          continue;
        }
        const cartoon = state.cartoon[lead] === 1;
        const trace = state.trace[lead] === 1;
        if (!(cartoon || trace)) {
          continue;
        }
        const color = state.colors[lead] ?? 0xffffff;
        const x1 = projected[3 * s] ?? 0;
        const y1 = projected[3 * s + 1] ?? 0;
        const x2 = projected[3 * s + 3] ?? 0;
        const y2 = projected[3 * s + 4] ?? 0;
        const z = ((projected[3 * s + 2] ?? 0) + (projected[3 * s + 5] ?? 0)) / 2;
        const w1 = cartoon ? (path.halfWidths[s] ?? 0) : 0;
        const w2 = cartoon ? (path.halfWidths[s + 1] ?? 0) : 0;
        if (w1 > 0 || w2 > 0) {
          const k1 = Math.max(w1, TUBE_RADIUS) * this.scale * (factor[s] ?? 1);
          const k2 = Math.max(w2, TUBE_RADIUS) * this.scale * (factor[s + 1] ?? 1);
          const it = this.item(Kind.QUAD, z);
          it.x1 = x1 + (gx[s] ?? 0) * k1;
          it.y1 = y1 + (gy[s] ?? 0) * k1;
          it.x2 = x2 + (gx[s + 1] ?? 0) * k2;
          it.y2 = y2 + (gy[s + 1] ?? 0) * k2;
          it.x3 = x2 - (gx[s + 1] ?? 0) * k2;
          it.y3 = y2 - (gy[s + 1] ?? 0) * k2;
          it.x4 = x1 - (gx[s] ?? 0) * k1;
          it.y4 = y1 - (gy[s] ?? 0) * k1;
          it.color = color;
          it.shade = 0.35 + 0.65 * Math.abs(((nz[s] ?? 0) + (nz[s + 1] ?? 0)) / 2);
        } else {
          const it = this.item(Kind.TUBE, z);
          Object.assign(it, { x1, y1, x2, y2, size: 2 * TUBE_RADIUS * this.scale * (factor[s] ?? 1), color });
        }
      }
      if (path.isNucleic) {
        this.addNucleicRungs(path, projected, input);
      }
    }
    this.addBackboneSticks(input);
  }

  /** Base "ladder rungs" from the backbone to N1 (purines) or N3 (pyrimidines), as in Jmol cartoons. */
  private addNucleicRungs(path: PolymerPath, projected: Float64Array, input: RenderInput): void {
    const { state } = input;
    const structure = state.structure;
    let last = -1;
    for (let s = 0; s < path.residues.length; s++) {
      const r = path.residues[s] ?? -1;
      if (r === last || s % 6 !== 0) {
        continue;
      }
      last = r;
      const residue = structure.residues[r];
      if (!residue || residue.leadAtom < 0 || !state.cartoon[residue.leadAtom] || state.hidden[residue.leadAtom]) {
        continue;
      }
      const purine = /G|A|I/.test(residue.name.toUpperCase());
      let target = -1;
      for (let i = residue.firstAtom; i < residue.endAtom; i++) {
        if (structure.atoms[i]?.name === (purine ? "N1" : "N3")) {
          target = i;
        }
      }
      if (target < 0) {
        continue;
      }
      const x1 = projected[3 * s] ?? 0;
      const y1 = projected[3 * s + 1] ?? 0;
      const it = this.item(Kind.TUBE, ((projected[3 * s + 2] ?? 0) + (this.sz[target] ?? 0)) / 2);
      Object.assign(it, {
        x1,
        y1,
        x2: this.sx[target] ?? 0,
        y2: this.sy[target] ?? 0,
        size: 2.4 * TUBE_RADIUS * this.scale,
        color: state.colors[residue.leadAtom] ?? 0xffffff,
      });
    }
  }

  /** Jmol `backbone`: straight sticks between consecutive lead atoms. */
  private addBackboneSticks(input: RenderInput): void {
    const { state } = input;
    const residues = state.structure.residues;
    for (let r = 1; r < residues.length; r++) {
      const prev = residues[r - 1];
      const cur = residues[r];
      if (
        !(prev && cur) ||
        prev.leadAtom < 0 ||
        cur.leadAtom < 0 ||
        prev.chain !== cur.chain ||
        cur.kind !== prev.kind
      ) {
        continue;
      }
      if (cur.kind !== ResidueKind.AMINO && cur.kind !== ResidueKind.NUCLEIC) {
        continue;
      }
      const a = prev.leadAtom;
      const b = cur.leadAtom;
      if (!(state.backbone[a] && state.backbone[b]) || state.hidden[a] || state.hidden[b]) {
        continue;
      }
      const gap = Math.hypot((this.sx[a] ?? 0) - (this.sx[b] ?? 0), (this.sy[a] ?? 0) - (this.sy[b] ?? 0));
      if (gap > 9 * this.scale) {
        continue;
      }
      const z = ((this.sz[a] ?? 0) + (this.sz[b] ?? 0)) / 2;
      const it = this.item(Kind.TUBE, z);
      Object.assign(it, {
        x1: this.sx[a] ?? 0,
        y1: this.sy[a] ?? 0,
        x2: this.sx[b] ?? 0,
        y2: this.sy[b] ?? 0,
        size: 2 * TUBE_RADIUS * this.scale,
        color: state.colors[a] ?? 0xffffff,
      });
    }
  }

  private addHydrogenBonds(bonds: readonly Bond[], state: DisplayState): void {
    for (const { a, b } of bonds) {
      if (!(state.isDisplayed(a) && state.isDisplayed(b))) {
        continue;
      }
      const it = this.item(Kind.DASH, ((this.sz[a] ?? 0) + (this.sz[b] ?? 0)) / 2);
      Object.assign(it, { x1: this.sx[a] ?? 0, y1: this.sy[a] ?? 0, x2: this.sx[b] ?? 0, y2: this.sy[b] ?? 0 });
    }
  }

  private addPolyhedra(polyhedra: readonly Polyhedron[], input: RenderInput): void {
    const { state, positions, rotation } = input;
    const v1: Vec3 = [0, 0, 0];
    for (const polyhedron of polyhedra) {
      if (state.hidden[polyhedron.center]) {
        continue;
      }
      const color = state.colors[polyhedron.center] ?? 0xffffff;
      for (const [a, b, c] of polyhedron.faces) {
        const it = this.item(Kind.FACE, ((this.sz[a] ?? 0) + (this.sz[b] ?? 0) + (this.sz[c] ?? 0)) / 3);
        Object.assign(it, {
          x1: this.sx[a] ?? 0,
          y1: this.sy[a] ?? 0,
          x2: this.sx[b] ?? 0,
          y2: this.sy[b] ?? 0,
          x3: this.sx[c] ?? 0,
          y3: this.sy[c] ?? 0,
          color,
        });
        const u: Vec3 = [
          (positions[3 * b] ?? 0) - (positions[3 * a] ?? 0),
          (positions[3 * b + 1] ?? 0) - (positions[3 * a + 1] ?? 0),
          (positions[3 * b + 2] ?? 0) - (positions[3 * a + 2] ?? 0),
        ];
        const w: Vec3 = [
          (positions[3 * c] ?? 0) - (positions[3 * a] ?? 0),
          (positions[3 * c + 1] ?? 0) - (positions[3 * a + 1] ?? 0),
          (positions[3 * c + 2] ?? 0) - (positions[3 * a + 2] ?? 0),
        ];
        const n: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const len = Math.hypot(...n) || 1;
        rotation.apply(n[0] / len, n[1] / len, n[2] / len, v1);
        it.shade = 0.45 + 0.55 * Math.abs(v1[2]);
      }
    }
  }

  // ── Painting ─────────────────────────────────────────────────────────────────

  private paintItems(ctx: CanvasRenderingContext2D): void {
    const count = this.itemCount;
    if (this.order.length !== count) {
      this.order = Array.from({ length: count }, (_, i) => i);
    } else {
      for (let i = 0; i < count; i++) {
        this.order[i] = i;
      }
    }
    const items = this.items;
    this.order.sort((p, q) => (items[p]?.z ?? 0) - (items[q]?.z ?? 0));
    ctx.lineJoin = "round";
    for (const index of this.order) {
      const it = items[index];
      if (!it) {
        continue;
      }
      switch (it.kind) {
        case Kind.SPHERE:
          if (it.size < 0.75) {
            ctx.fillStyle = this.css(it.color);
            ctx.fillRect(it.x1 - 0.75, it.y1 - 0.75, 1.5, 1.5);
          } else {
            ctx.drawImage(this.sprite(it.color), it.x1 - it.size, it.y1 - it.size, 2 * it.size, 2 * it.size);
          }
          break;
        case Kind.CYLINDER:
          this.paintCylinder(ctx, it, "butt");
          break;
        case Kind.TUBE:
          this.paintCylinder(ctx, it, "round");
          break;
        case Kind.LINE:
          ctx.lineCap = "round";
          ctx.lineWidth = it.size;
          ctx.strokeStyle = this.css(it.color);
          ctx.beginPath();
          ctx.moveTo(it.x1, it.y1);
          ctx.lineTo(it.x2, it.y2);
          ctx.stroke();
          break;
        case Kind.QUAD: {
          const fill = this.css(shadeColor(it.color, it.shade));
          ctx.fillStyle = fill;
          ctx.strokeStyle = fill;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(it.x1, it.y1);
          ctx.lineTo(it.x2, it.y2);
          ctx.lineTo(it.x3, it.y3);
          ctx.lineTo(it.x4, it.y4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        }
        case Kind.FACE:
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = this.css(shadeColor(it.color, it.shade));
          ctx.beginPath();
          ctx.moveTo(it.x1, it.y1);
          ctx.lineTo(it.x2, it.y2);
          ctx.lineTo(it.x3, it.y3);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = this.css(shadeColor(it.color, 0.6));
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case Kind.DASH:
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = this.input?.colors.hydrogenBond ?? "";
          ctx.beginPath();
          ctx.moveTo(it.x1, it.y1);
          ctx.lineTo(it.x2, it.y2);
          ctx.stroke();
          ctx.restore();
          break;
        default:
          break;
      }
    }
  }

  /** Three concentric strokes fake a lit cylinder: dark rim, body, highlight. */
  private paintCylinder(ctx: CanvasRenderingContext2D, it: Item, cap: CanvasLineCap): void {
    // Tube segments are short and overlap; round caps there would bead the tube.
    ctx.lineCap = it.kind === Kind.TUBE && it.size > 4 ? "butt" : cap;
    ctx.beginPath();
    ctx.moveTo(it.x1, it.y1);
    ctx.lineTo(it.x2, it.y2);
    ctx.lineWidth = it.size;
    ctx.strokeStyle = this.css(shadeColor(it.color, 0.55));
    ctx.stroke();
    if (it.size < 2.5) {
      return;
    }
    ctx.lineCap = "butt";
    ctx.lineWidth = it.size * 0.7;
    ctx.strokeStyle = this.css(it.color);
    ctx.stroke();
    if (it.size < 5) {
      return;
    }
    const dx = it.x2 - it.x1;
    const dy = it.y2 - it.y1;
    const len = Math.hypot(dx, dy) || 1;
    // Offset the highlight toward the upper-left light.
    let ox = (-dy / len) * it.size * 0.17;
    let oy = (dx / len) * it.size * 0.17;
    if (ox + oy > 0) {
      ox = -ox;
      oy = -oy;
    }
    ctx.beginPath();
    ctx.moveTo(it.x1 + ox, it.y1 + oy);
    ctx.lineTo(it.x2 + ox, it.y2 + oy);
    ctx.lineWidth = it.size * 0.22;
    ctx.strokeStyle = this.css(lighten(it.color, 0.45));
    ctx.stroke();
  }

  private paintUnitCell(ctx: CanvasRenderingContext2D, cell: UnitCell, input: RenderInput): void {
    const corners = cell.corners(input.cellRange).map((p) => this.projectPoint(p, input));
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = input.colors.unitCell;
    ctx.beginPath();
    for (const [i, j] of CELL_EDGES) {
      const a = corners[i];
      const b = corners[j];
      if (a && b) {
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
    }
    ctx.stroke();
    // Label the origin and the a, b, c axis ends of the first cell.
    const unit = cell.corners([1, 1, 1]).map((p) => this.projectPoint(p, input));
    ctx.fillStyle = input.colors.unitCell;
    ctx.font = input.font;
    const [o, a, b, c] = [unit[0], unit[1], unit[2], unit[4]];
    const labels = input.cellLabels;
    [o, a, b, c].forEach((p, k) => {
      if (p) {
        ctx.fillText(labels[k] ?? "", p[0] + 4, p[1] - 4);
      }
    });
    ctx.restore();
  }

  private paintOverlays(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const { state, colors } = input;
    const n = state.atomCount;
    ctx.save();
    if (input.showHalos) {
      ctx.strokeStyle = colors.halo;
      ctx.lineWidth = 3;
      for (let i = 0; i < n; i++) {
        if (state.selected[i] && this.pickable[i]) {
          this.ring(ctx, i, 3);
        }
      }
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.pick;
    for (const i of input.pendingPicks) {
      this.ring(ctx, i, 4);
    }
    if (input.picked !== null) {
      this.ring(ctx, input.picked, 4);
    }
    if (input.hovered !== null) {
      ctx.strokeStyle = colors.hover;
      ctx.setLineDash([3, 3]);
      this.ring(ctx, input.hovered, 6);
      ctx.setLineDash([]);
    }

    // Labels sit to the upper right of their atom.
    ctx.font = input.font;
    ctx.fillStyle = colors.label;
    ctx.textBaseline = "bottom";
    for (let i = 0; i < n; i++) {
      const label = state.labels[i];
      if (label && !state.hidden[i]) {
        const r = Math.max(this.sr[i] ?? 0, 3) * 0.7;
        ctx.fillText(label, (this.sx[i] ?? 0) + r + 1, (this.sy[i] ?? 0) - r - 1);
      }
    }

    // Measurements: dashed polyline through the atoms, value at the middle.
    ctx.strokeStyle = colors.measurement;
    ctx.fillStyle = colors.measurement;
    ctx.lineWidth = 1.5;
    ctx.textBaseline = "middle";
    for (const measurement of input.measurements) {
      const pts = measurement.atoms.map((i) => [this.sx[i] ?? 0, this.sy[i] ?? 0] as const);
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (const [k, [x, y]] of pts.entries()) {
        if (k === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const mid =
        pts.length === 2
          ? [((pts[0]?.[0] ?? 0) + (pts[1]?.[0] ?? 0)) / 2, ((pts[0]?.[1] ?? 0) + (pts[1]?.[1] ?? 0)) / 2]
          : pts.length === 3
            ? [pts[1]?.[0] ?? 0, pts[1]?.[1] ?? 0]
            : [((pts[1]?.[0] ?? 0) + (pts[2]?.[0] ?? 0)) / 2, ((pts[1]?.[1] ?? 0) + (pts[2]?.[1] ?? 0)) / 2];
      ctx.fillText(input.measurementLabel(measurement), (mid[0] ?? 0) + 6, (mid[1] ?? 0) - 8);
    }
    ctx.restore();
  }

  private ring(ctx: CanvasRenderingContext2D, i: number, pad: number): void {
    if (i < 0 || i >= this.sx.length) {
      return;
    }
    ctx.beginPath();
    ctx.arc(this.sx[i] ?? 0, this.sy[i] ?? 0, Math.max(this.sr[i] ?? 0, 4) + pad, 0, 2 * Math.PI);
    ctx.stroke();
  }

  /** A small x/y/z orientation gizmo in the lower-left corner. */
  private paintAxes(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const size = Math.min(input.width, input.height) * 0.08;
    const ox = size * 1.4;
    const oy = input.height - size * 1.4;
    const axes: [Vec3, string, string][] = [
      [[1, 0, 0], input.colors.axisX, input.axisLabels[0]],
      [[0, 1, 0], input.colors.axisY, input.axisLabels[1]],
      [[0, 0, 1], input.colors.axisZ, input.axisLabels[2]],
    ];
    const v: Vec3 = [0, 0, 0];
    const projected = axes.map(([axis, color, label]) => {
      input.rotation.apply(axis[0], axis[1], axis[2], v);
      return { x: ox + v[0] * size, y: oy - v[1] * size, z: v[2], color, label };
    });
    projected.sort((p, q) => p.z - q.z);
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.font = input.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of projected) {
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillText(p.label, ox + (p.x - ox) * 1.3, oy + (p.y - oy) * 1.3);
    }
    ctx.restore();
  }

  // ── Colour helpers ───────────────────────────────────────────────────────────

  private css(color: number): string {
    let s = this.cssCache.get(color);
    if (!s) {
      s = `#${color.toString(16).padStart(6, "0")}`;
      this.cssCache.set(color, s);
    }
    return s;
  }

  /** A pre-shaded sphere for one colour: radial gradient with a specular highlight. */
  private sprite(color: number): HTMLCanvasElement {
    const cached = this.sprites.get(color);
    if (cached) {
      return cached;
    }
    if (this.sprites.size >= MAX_SPRITES) {
      this.sprites.clear();
    }
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;
    const c = canvas.getContext("2d");
    if (c) {
      const r = SPRITE_SIZE / 2;
      const g = c.createRadialGradient(r * 0.65, r * 0.6, r * 0.05, r, r, r);
      g.addColorStop(0, this.css(lighten(color, 0.75)));
      g.addColorStop(0.25, this.css(lighten(color, 0.25)));
      g.addColorStop(0.7, this.css(color));
      g.addColorStop(1, this.css(shadeColor(color, 0.35)));
      c.fillStyle = g;
      c.beginPath();
      c.arc(r, r, r - 0.5, 0, 2 * Math.PI);
      c.fill();
    }
    this.sprites.set(color, canvas);
    return canvas;
  }
}

/** Scales a colour's brightness (0 = black, 1 = unchanged). */
export function shadeColor(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 255) * factor);
  const g = Math.round(((color >> 8) & 255) * factor);
  const b = Math.round((color & 255) * factor);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
}

/** Blends a colour toward white. */
export function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return (
    (Math.round(r + (255 - r) * amount) << 16) |
    (Math.round(g + (255 - g) * amount) << 8) |
    Math.round(b + (255 - b) * amount)
  );
}
