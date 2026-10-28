/**
 * parseMol.ts
 *
 * MDL Molfile / SDF (V2000). Reads the header title, the atom block (coordinates,
 * symbol, charge code) and the bond block with bond orders, which is why
 * benzene and caffeine show their double bonds. Multiple SDF records with the same
 * atom count load as frames.
 */

import { elementForSymbol } from "../Elements.js";
import type { Atom, Bond, Frame, Structure } from "../Structure.js";
import { buildStructure } from "../StructureBuilder.js";
import { makeAtom, StructureParseError } from "./makeAtom.js";

/** V2000 charge codes: 1 = +3, 2 = +2, 3 = +1, 5 = −1, 6 = −2, 7 = −3. */
const CHARGE_CODES: Record<string, number> = { "1": 3, "2": 2, "3": 1, "5": -1, "6": -2, "7": -3 };

export function parseMol(text: string, fallbackTitle: string): Structure {
  const records = text.split(/^\$\$\$\$\s*$/m).filter((r) => r.trim().length > 0);
  let atoms: Atom[] = [];
  let bonds: Bond[] = [];
  let title = "";
  const frames: Frame[] = [];
  for (const record of records) {
    const lines = record.replace(/^\s*\n/, "").split(/\r?\n/);
    const countsIndex = lines.findIndex((l) => /V2000/.test(l));
    if (countsIndex < 0) {
      if (lines.some((l) => /V3000/.test(l))) {
        throw new StructureParseError("molV3000");
      }
      continue;
    }
    const counts = lines[countsIndex] ?? "";
    const atomCount = Number.parseInt(counts.slice(0, 3), 10);
    const bondCount = Number.parseInt(counts.slice(3, 6), 10);
    if (!Number.isFinite(atomCount)) {
      throw new StructureParseError("molCounts");
    }
    const positions = new Float64Array(3 * atomCount);
    const recordAtoms: Atom[] = [];
    for (let i = 0; i < atomCount; i++) {
      const row = lines[countsIndex + 1 + i] ?? "";
      positions[3 * i] = Number(row.slice(0, 10));
      positions[3 * i + 1] = Number(row.slice(10, 20));
      positions[3 * i + 2] = Number(row.slice(20, 30));
      const symbol = row.slice(31, 34).trim();
      const charge = CHARGE_CODES[row.slice(36, 39).trim()] ?? 0;
      recordAtoms.push(makeAtom({ element: elementForSymbol(symbol), serial: i + 1, formalCharge: charge }));
    }
    const recordBonds: Bond[] = [];
    for (let i = 0; i < bondCount; i++) {
      const row = lines[countsIndex + 1 + atomCount + i] ?? "";
      const a = Number.parseInt(row.slice(0, 3), 10) - 1;
      const b = Number.parseInt(row.slice(3, 6), 10) - 1;
      const type = Number.parseInt(row.slice(6, 9), 10);
      if (a >= 0 && b >= 0 && a < atomCount && b < atomCount) {
        recordBonds.push({ a, b, order: type === 4 ? 1.5 : Math.min(3, Math.max(1, type)) });
      }
    }
    if (frames.length === 0) {
      atoms = recordAtoms;
      bonds = recordBonds;
      title = (lines[0] ?? "").trim();
    } else if (atomCount !== atoms.length) {
      break;
    }
    frames.push({ comment: (lines[0] ?? "").trim(), positions, vibrations: null });
  }
  if (frames.length === 0) {
    throw new StructureParseError("empty");
  }
  // PubChem SDF titles are bare CIDs; prefer the caller's name then.
  const usefulTitle = /^\d*$/.test(title) ? fallbackTitle : title;
  return buildStructure({ title: usefulTitle, format: "MOL", atoms, frames, bonds, perceive: bonds.length === 0 });
}
