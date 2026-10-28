/**
 * MolScopeScreenIcons.ts
 *
 * Home-screen and navigation-bar icons, drawn on the standard 548 × 373 canvas:
 * a water molecule (Molecules), a helix and β-strand arrow (Biomolecules), and a
 * rock-salt cell (Crystals). Atom and structure colours come from the same data
 * palettes the viewer uses, so the icons match what each screen shows.
 */

import { Shape } from "scenerystack/kite";
import { Line, Node, Path, Rectangle } from "scenerystack/scenery";
import { ShadedSphereNode } from "scenerystack/scenery-phet";
import { ScreenIcon } from "scenerystack/sim";
import MolScopeColors from "../MolScopeColors.js";
import { elementForSymbol } from "./model/Elements.js";

const W = 548;
const H = 373;

/** Jmol `structure` colours for helix and sheet (data, as in ColorSchemes.ts). */
const HELIX_COLOR = elementCss(0xff0080);
const SHEET_COLOR = elementCss(0xffc800);

function elementCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function atomColor(symbol: string): string {
  return elementCss(elementForSymbol(symbol).color);
}

function background(): Rectangle {
  return new Rectangle(0, 0, W, H, { fill: MolScopeColors.backgroundColorProperty });
}

function iconFrom(content: Node): ScreenIcon {
  return new ScreenIcon(content, {
    maxIconWidthProportion: 1,
    maxIconHeightProportion: 1,
    fill: MolScopeColors.backgroundColorProperty,
  });
}

function sphere(symbol: string, diameter: number, x: number, y: number): ShadedSphereNode {
  return new ShadedSphereNode(diameter, { mainColor: atomColor(symbol), centerX: x, centerY: y });
}

function stick(x1: number, y1: number, x2: number, y2: number, width = 26): Line {
  return new Line(x1, y1, x2, y2, { stroke: MolScopeColors.unitCellColorProperty, lineWidth: width, lineCap: "round" });
}

export function createMoleculesIcon(): ScreenIcon {
  const cx = W / 2;
  const cy = H / 2 - 30;
  const half = (104.5 / 2) * (Math.PI / 180);
  const r = 150;
  const hx = r * Math.sin(half);
  const hy = r * Math.cos(half);
  return iconFrom(
    new Node({
      children: [
        background(),
        stick(cx, cy, cx - hx, cy + hy),
        stick(cx, cy, cx + hx, cy + hy),
        sphere("O", 170, cx, cy),
        sphere("H", 110, cx - hx, cy + hy),
        sphere("H", 110, cx + hx, cy + hy),
      ],
    }),
  );
}

export function createBiomoleculesIcon(): ScreenIcon {
  // A helix seen side-on: alternating front and back half-turns of a flat ribbon.
  const helix = new Node();
  const turns = 4;
  const x0 = 70;
  const pitch = 70;
  const amplitude = 95;
  const cy = H / 2 - 20;
  for (let i = 0; i < turns * 2; i++) {
    const front = i % 2 === 0;
    const xa = x0 + (i * pitch) / 2;
    const shape = new Shape()
      .moveTo(xa, cy - amplitude)
      .cubicCurveTo(
        xa + pitch * 0.35,
        cy - amplitude,
        xa + pitch * 0.15,
        cy + amplitude,
        xa + pitch / 2,
        cy + amplitude,
      )
      .lineTo(xa + pitch / 2 + 26, cy + amplitude)
      .cubicCurveTo(
        xa + pitch * 0.15 + 26,
        cy + amplitude,
        xa + pitch * 0.35 + 26,
        cy - amplitude,
        xa + 26,
        cy - amplitude,
      )
      .close();
    helix.addChild(new Path(shape, { fill: HELIX_COLOR, opacity: front ? 1 : 0.55 }));
  }
  const arrowY = H - 70;
  const arrow = new Path(
    new Shape()
      .moveTo(70, arrowY - 22)
      .lineTo(380, arrowY - 22)
      .lineTo(380, arrowY - 48)
      .lineTo(470, arrowY)
      .lineTo(380, arrowY + 48)
      .lineTo(380, arrowY + 22)
      .lineTo(70, arrowY + 22)
      .close(),
    { fill: SHEET_COLOR },
  );
  return iconFrom(new Node({ children: [background(), helix, arrow] }));
}

export function createCrystalsIcon(): ScreenIcon {
  // Rock salt: an oblique cube with alternating Na and Cl at the corners and edge midpoints.
  const s = 230;
  const ox = W / 2 - s / 2 - 40;
  const oy = H / 2 + s / 2 - 20;
  const dx = 90;
  const dy = -70;
  const point = (i: number, j: number, k: number) => [ox + (i * s) / 2 + (k * dx) / 2, oy - (j * s) / 2 + (k * dy) / 2];
  const children: Node[] = [background()];
  const lines = new Node();
  const spheres: { node: Node; depth: number }[] = [];
  for (let i = 0; i <= 2; i++) {
    for (let j = 0; j <= 2; j++) {
      for (let k = 0; k <= 2; k++) {
        if ([i, j, k].filter((v) => v === 1).length > 1) {
          continue; // Keep corners and edge midpoints only, so the cube reads clearly.
        }
        const [x = 0, y = 0] = point(i, j, k);
        const symbol = (i + j + k) % 2 === 0 ? "Na" : "Cl";
        spheres.push({ node: sphere(symbol, symbol === "Na" ? 58 : 76, x, y), depth: k });
        for (const [a, b, c] of [
          [i + 1, j, k],
          [i, j + 1, k],
          [i, j, k + 1],
        ] as const) {
          if (a <= 2 && b <= 2 && c <= 2 && [a, b, c].filter((v) => v === 1).length <= 1) {
            const [x2 = 0, y2 = 0] = point(a, b, c);
            lines.addChild(stick(x, y, x2, y2, 10));
          }
        }
      }
    }
  }
  spheres.sort((p, q) => q.depth - p.depth);
  children.push(lines, ...spheres.map((p) => p.node));
  return iconFrom(new Node({ children }));
}
