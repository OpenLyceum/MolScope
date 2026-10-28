/**
 * ColorSchemes.ts
 *
 * Per-atom colouring schemes, matching Jmol's names and palettes where they exist:
 * `cpk` (element), `chain`, `structure`, `temperature` (B-factor, blue→red),
 * `amino` (residue type), `group` (rainbow along each chain), and `formalCharge`.
 * Colours are 0xRRGGBB integers so this module stays free of Scenery.
 */

import type { Structure } from "./Structure.js";
import { ResidueKind, SecondaryStructure } from "./Structure.js";

export const ColorScheme = {
  ELEMENT: "cpk",
  CHAIN: "chain",
  STRUCTURE: "structure",
  TEMPERATURE: "temperature",
  AMINO: "amino",
  GROUP: "group",
  CHARGE: "formalCharge",
} as const;
export type ColorSchemeValue = (typeof ColorScheme)[keyof typeof ColorScheme];

export const COLOR_SCHEMES: readonly ColorSchemeValue[] = Object.values(ColorScheme);

/** Jmol chain colours for chains A–Z (upper) — the ones users recognise from Jmol pictures. */
const CHAIN_COLORS = [
  0xc0d0ff, 0xb0ffb0, 0xffc0c8, 0xffff80, 0xffc0ff, 0xb0f0f0, 0xffd070, 0xf08080, 0xf5deb3, 0x00bfff, 0xcd5c5c,
  0x66cdaa, 0x9acd32, 0xee82ee, 0x00ced1, 0x00ff7f, 0x3cb371, 0x00008b, 0xbdb76b, 0x006400, 0x800000, 0x808000,
  0x800080, 0x008080, 0xb8860b, 0xb22222,
];

/** Jmol `structure` colours. */
const STRUCTURE_COLORS: Record<number, number> = {
  [SecondaryStructure.HELIX]: 0xff0080,
  [SecondaryStructure.SHEET]: 0xffc800,
  [SecondaryStructure.TURN]: 0x6080ff,
  [SecondaryStructure.NONE]: 0xffffff,
};
const NUCLEIC_STRUCTURE_COLOR = 0xae00fe;

/** Jmol `amino` colours (after RasMol). */
const AMINO_COLORS: Record<string, number> = {
  ALA: 0xc8c8c8,
  ARG: 0x145aff,
  ASN: 0x00dcdc,
  ASP: 0xe60a0a,
  CYS: 0xe6e600,
  GLN: 0x00dcdc,
  GLU: 0xe60a0a,
  GLY: 0xebebeb,
  HIS: 0x8282d2,
  ILE: 0x0f820f,
  LEU: 0x0f820f,
  LYS: 0x145aff,
  MET: 0xe6e600,
  PHE: 0x3232aa,
  PRO: 0xdc9682,
  SER: 0xfa9600,
  THR: 0xfa9600,
  TRP: 0xb45ab4,
  TYR: 0x3232aa,
  VAL: 0x0f820f,
  A: 0xa0a0ff,
  DA: 0xa0a0ff,
  G: 0xff7070,
  DG: 0xff7070,
  C: 0xff8c4b,
  DC: 0xff8c4b,
  T: 0xa0ffa0,
  DT: 0xa0ffa0,
  U: 0xff8080,
};
const AMINO_DEFAULT = 0xbea06e;

/** Jmol's colour names (a useful subset of the CSS names) plus the RasMol extras. */
export const NAMED_COLORS: Record<string, number> = {
  black: 0x000000,
  white: 0xffffff,
  red: 0xff0000,
  green: 0x008000,
  lime: 0x00ff00,
  blue: 0x0000ff,
  yellow: 0xffff00,
  cyan: 0x00ffff,
  magenta: 0xff00ff,
  orange: 0xffa500,
  purple: 0x800080,
  pink: 0xffc0cb,
  gray: 0x808080,
  grey: 0x808080,
  silver: 0xc0c0c0,
  gold: 0xffd700,
  brown: 0xa52a2a,
  violet: 0xee82ee,
  navy: 0x000080,
  teal: 0x008080,
  olive: 0x808000,
  maroon: 0x800000,
  skyblue: 0x87ceeb,
  lightblue: 0xadd8e6,
  lightgreen: 0x90ee90,
  lightgray: 0xd3d3d3,
  darkgray: 0xa9a9a9,
  darkblue: 0x00008b,
  darkgreen: 0x006400,
  darkred: 0x8b0000,
  salmon: 0xfa8072,
  coral: 0xff7f50,
  tan: 0xd2b48c,
  turquoise: 0x40e0d0,
  indigo: 0x4b0082,
  greenblue: 0x2e8b57,
  bluetint: 0xafd7ff,
  greentint: 0x98ffb3,
  pinktint: 0xffabbb,
  redorange: 0xff4500,
  yellowtint: 0xf6f675,
};

/**
 * Parses a Jmol colour argument: a colour name, an "[r,g,b]" triple, or a hex value
 * written as "[xRRGGBB]" or "#RRGGBB".
 * Returns null if it is not a colour.
 */
export function parseColor(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (t in NAMED_COLORS) {
    return NAMED_COLORS[t] ?? null;
  }
  const hex = /^(?:#|\[x)([0-9a-f]{6})\]?$/.exec(t);
  if (hex?.[1]) {
    return Number.parseInt(hex[1], 16);
  }
  const rgb = /^\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]$/.exec(t);
  if (rgb) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((v) => Math.min(255, v));
    return ((r ?? 0) << 16) | ((g ?? 0) << 8) | (b ?? 0);
  }
  return null;
}

/** Linear blend between two 0xRRGGBB colours. */
export function mixColors(c1: number, c2: number, t: number): number {
  const r = Math.round(((c1 >> 16) & 255) * (1 - t) + ((c2 >> 16) & 255) * t);
  const g = Math.round(((c1 >> 8) & 255) * (1 - t) + ((c2 >> 8) & 255) * t);
  const b = Math.round((c1 & 255) * (1 - t) + (c2 & 255) * t);
  return (r << 16) | (g << 8) | b;
}

/** Jmol's "roygb" rainbow, t ∈ [0, 1] from red to blue. */
export function rainbow(t: number): number {
  const stops = [0xff0000, 0xffa500, 0xffff00, 0x00ff00, 0x0000ff];
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return mixColors(stops[i] ?? 0, stops[i + 1] ?? 0, x - i);
}

/** Blue (cold) → white → red (hot), Jmol's `temperature` "bwr" gradient. */
function temperatureColor(t: number): number {
  return t < 0.5 ? mixColors(0x0000ff, 0xffffff, t * 2) : mixColors(0xffffff, 0xff0000, (t - 0.5) * 2);
}

export function chainColor(chain: string): number {
  if (!chain) {
    return 0xffffff;
  }
  const code = chain.toUpperCase().charCodeAt(0);
  const index = code >= 65 && code <= 90 ? code - 65 : code % CHAIN_COLORS.length;
  return CHAIN_COLORS[index] ?? 0xffffff;
}

/**
 * Colours every atom whose `mask` entry is set, writing into `colors`.
 * Element colouring is the default for atoms with no residue data.
 */
export function applyColorScheme(
  structure: Structure,
  scheme: ColorSchemeValue,
  mask: Uint8Array,
  colors: Uint32Array,
): void {
  const atoms = structure.atoms;
  let minB = Number.POSITIVE_INFINITY;
  let maxB = Number.NEGATIVE_INFINITY;
  if (scheme === ColorScheme.TEMPERATURE) {
    for (const atom of atoms) {
      minB = Math.min(minB, atom.bFactor);
      maxB = Math.max(maxB, atom.bFactor);
    }
  }
  // Rainbow position of each residue along its chain, for `group`.
  const groupFraction = new Float64Array(structure.residues.length);
  if (scheme === ColorScheme.GROUP) {
    const byChain = new Map<string, number[]>();
    structure.residues.forEach((residue, index) => {
      if (residue.kind === ResidueKind.AMINO || residue.kind === ResidueKind.NUCLEIC) {
        const list = byChain.get(residue.chain) ?? [];
        list.push(index);
        byChain.set(residue.chain, list);
      }
    });
    for (const list of byChain.values()) {
      list.forEach((residueIndex, k) => {
        groupFraction[residueIndex] = list.length > 1 ? k / (list.length - 1) : 0;
      });
    }
  }

  atoms.forEach((atom, i) => {
    if (!mask[i]) {
      return;
    }
    const residue = structure.residues[atom.residueIndex];
    let color = atom.element.color;
    switch (scheme) {
      case ColorScheme.CHAIN:
        color = atom.chain ? chainColor(atom.chain) : color;
        break;
      case ColorScheme.STRUCTURE:
        if (residue?.kind === ResidueKind.NUCLEIC) {
          color = NUCLEIC_STRUCTURE_COLOR;
        } else if (residue?.kind === ResidueKind.AMINO) {
          color = STRUCTURE_COLORS[atom.secondaryStructure] ?? 0xffffff;
        }
        break;
      case ColorScheme.TEMPERATURE:
        color = temperatureColor(maxB > minB ? (atom.bFactor - minB) / (maxB - minB) : 0.5);
        break;
      case ColorScheme.AMINO:
        if (residue && (residue.kind === ResidueKind.AMINO || residue.kind === ResidueKind.NUCLEIC)) {
          color = AMINO_COLORS[residue.name.toUpperCase()] ?? AMINO_DEFAULT;
        }
        break;
      case ColorScheme.GROUP:
        if (residue && (residue.kind === ResidueKind.AMINO || residue.kind === ResidueKind.NUCLEIC)) {
          color = rainbow(groupFraction[atom.residueIndex] ?? 0);
        }
        break;
      case ColorScheme.CHARGE:
        color = atom.formalCharge > 0 ? 0x3050f8 : atom.formalCharge < 0 ? 0xff0d0d : 0xffffff;
        break;
      default:
        break;
    }
    colors[i] = color;
  });
}
