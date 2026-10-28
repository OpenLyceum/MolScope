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
import { makeAtom, StructureParseError } from "./makeAtom.js";

export function parseXyz(text: string, fallbackTitle: string): Structure {
  const lines = text.split(/\r?\n/);
  const frames: Frame[] = [];
  let atoms: Atom[] = [];
  let line = 0;
  while (line < lines.length) {
    const countText = (lines[line] ?? "").trim();
    if (countText === "") {
      line++;
      continue;
    }
    const count = Number.parseInt(countText, 10);
    if (!Number.isFinite(count) || count <= 0) {
      if (frames.length === 0) {
        throw new StructureParseError("xyzCount");
      }
      break;
    }
    const comment = (lines[line + 1] ?? "").trim();
    const positions = new Float64Array(3 * count);
    let vibrations: Float64Array | null = null;
    const frameAtoms: Atom[] = [];
    for (let i = 0; i < count; i++) {
      const fields = (lines[line + 2 + i] ?? "").trim().split(/\s+/);
      if (fields.length < 4) {
        throw new StructureParseError("xyzRow");
      }
      const token = fields[0] ?? "";
      const element = /^\d+$/.test(token)
        ? elementForNumber(Number(token))
        : elementForSymbol(token.replace(/\d+$/, ""));
      frameAtoms.push(makeAtom({ element, serial: i + 1 }));
      positions[3 * i] = Number(fields[1]);
      positions[3 * i + 1] = Number(fields[2]);
      positions[3 * i + 2] = Number(fields[3]);
      if (fields.length >= 7) {
        vibrations ??= new Float64Array(3 * count);
        vibrations[3 * i] = Number(fields[4]);
        vibrations[3 * i + 1] = Number(fields[5]);
        vibrations[3 * i + 2] = Number(fields[6]);
      }
    }
    if (frames.length > 0 && count !== atoms.length) {
      break; // A different molecule: keep the first trajectory only.
    }
    if (frames.length === 0) {
      atoms = frameAtoms;
    }
    frames.push({ comment, positions, vibrations });
    line += 2 + count;
  }
  if (frames.length === 0) {
    throw new StructureParseError("empty");
  }
  const title = frames[0]?.comment || fallbackTitle;
  return buildStructure({ title, format: "XYZ", atoms, frames });
}
