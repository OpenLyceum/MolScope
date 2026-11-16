/**
 * parseXyz.ts
 *
 * XYZ and extended XYZ. Each frame is an atom count, a comment line, then
 * "El x y z" rows; an optional "vx vy vz" triple per row is read as a vibration
 * vector (Jmol's convention for normal modes). Consecutive frames with the same
 * atom count become an animation.
 */

import { elementForNumber, elementForSymbol } from "../Elements.js";
import type { Atom, Frame, Structure } from "../Structure.js";
import { buildStructure } from "../StructureBuilder.js";
import { framesCompatible } from "./frameCompatibility.js";
import { makeAtom, parseCoordinate, StructureParseError } from "./makeAtom.js";

type XyzFrameParts = {
  readonly atoms: Atom[];
  readonly positions: Float64Array;
  readonly vibrations: Float64Array | null;
  readonly comment: string;
};

function elementFromXyzToken(token: string) {
  return /^\d+$/.test(token) ? elementForNumber(Number(token)) : elementForSymbol(token.replace(/\d+$/, ""));
}

function readXyzAtomRow(
  fields: readonly string[],
  index: number,
  count: number,
  positions: Float64Array,
  vibrations: Float64Array | null,
): { atom: Atom; vibrations: Float64Array | null } {
  if (fields.length < 4) {
    throw new StructureParseError("xyzRow");
  }
  const atom = makeAtom({ element: elementFromXyzToken(fields[0] ?? ""), serial: index + 1 });
  positions[3 * index] = parseCoordinate(fields[1]);
  positions[3 * index + 1] = parseCoordinate(fields[2]);
  positions[3 * index + 2] = parseCoordinate(fields[3]);
  let nextVibrations = vibrations;
  if (fields.length >= 7) {
    nextVibrations ??= new Float64Array(3 * count);
    nextVibrations[3 * index] = parseCoordinate(fields[4]);
    nextVibrations[3 * index + 1] = parseCoordinate(fields[5]);
    nextVibrations[3 * index + 2] = parseCoordinate(fields[6]);
  }
  return { atom, vibrations: nextVibrations };
}

function readXyzFrame(lines: readonly string[], start: number, count: number, comment: string): XyzFrameParts {
  const positions = new Float64Array(3 * count);
  let vibrations: Float64Array | null = null;
  const atoms: Atom[] = [];
  for (let i = 0; i < count; i++) {
    const fields = (lines[start + i] ?? "").trim().split(/\s+/);
    const row = readXyzAtomRow(fields, i, count, positions, vibrations);
    atoms.push(row.atom);
    vibrations = row.vibrations;
  }
  return { atoms, positions, vibrations, comment };
}

/** Returns null when a non-count line ends a multi-frame stream after at least one frame. */
function tryReadNextXyzFrame(
  lines: readonly string[],
  line: number,
  hasFrames: boolean,
): { parts: XyzFrameParts; nextLine: number } | null {
  const count = Number.parseInt((lines[line] ?? "").trim(), 10);
  if (!Number.isFinite(count) || count <= 0) {
    if (!hasFrames) {
      throw new StructureParseError("xyzCount");
    }
    return null;
  }
  const comment = (lines[line + 1] ?? "").trim();
  const parts = readXyzFrame(lines, line + 2, count, comment);
  return { parts, nextLine: line + 2 + count };
}

export function parseXyz(text: string, fallbackTitle: string): Structure {
  const lines = text.split(/\r?\n/);
  const frames: Frame[] = [];
  let atoms: Atom[] = [];
  let line = 0;
  while (line < lines.length) {
    if ((lines[line] ?? "").trim() === "") {
      line++;
      continue;
    }
    const next = tryReadNextXyzFrame(lines, line, frames.length > 0);
    if (next === null) {
      break;
    }
    if (frames.length > 0 && !framesCompatible(atoms, next.parts.atoms)) {
      throw new StructureParseError("incompatibleFrames");
    }
    if (frames.length === 0) {
      atoms = next.parts.atoms;
    }
    frames.push({
      comment: next.parts.comment,
      positions: next.parts.positions,
      vibrations: next.parts.vibrations,
    });
    line = next.nextLine;
  }
  if (frames.length === 0) {
    throw new StructureParseError("empty");
  }
  const title = frames[0]?.comment || fallbackTitle;
  return buildStructure({ title, format: "XYZ", atoms, frames });
}
