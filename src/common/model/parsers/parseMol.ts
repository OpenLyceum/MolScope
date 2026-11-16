/**
 * parseMol.ts
 *
 * MDL Molfile / SDF (V2000). Reads the header title, the atom block (coordinates,
 * symbol, charge code), `M  CHG` charges and the bond block with bond orders, which
 * is why benzene and caffeine show their double bonds. Multiple SDF records with the
 * same atom identities, charges and bond graph load as frames; mixed compounds are rejected.
 */

import { elementForSymbol } from "../Elements.js";
import type { Atom, Bond, Frame, Structure } from "../Structure.js";
import { buildStructure } from "../StructureBuilder.js";
import { framesCompatible } from "./frameCompatibility.js";
import { makeAtom, parseCoordinate, StructureParseError } from "./makeAtom.js";

/** V2000 charge codes: 1 = +3, 2 = +2, 3 = +1, 5 = −1, 6 = −2, 7 = −3. */
const CHARGE_CODES: Record<string, number> = { "1": 3, "2": 2, "3": 1, "5": -1, "6": -2, "7": -3 };

type MolRecordParts = {
  readonly atoms: Atom[];
  readonly bonds: Bond[];
  readonly positions: Float64Array;
  readonly title: string;
};

function findCountsIndex(lines: readonly string[]): number {
  const countsIndex = lines.findIndex((l) => /V2000/.test(l));
  if (countsIndex >= 0) {
    return countsIndex;
  }
  if (lines.some((l) => /V3000/.test(l))) {
    throw new StructureParseError("molV3000");
  }
  return -1;
}

function readAtomBlock(
  lines: readonly string[],
  countsIndex: number,
  atomCount: number,
): { positions: Float64Array; symbols: string[]; charges: number[] } {
  const positions = new Float64Array(3 * atomCount);
  const symbols: string[] = [];
  const charges = new Array<number>(atomCount).fill(0);
  for (let i = 0; i < atomCount; i++) {
    const row = lines[countsIndex + 1 + i] ?? "";
    positions[3 * i] = parseCoordinate(row.slice(0, 10));
    positions[3 * i + 1] = parseCoordinate(row.slice(10, 20));
    positions[3 * i + 2] = parseCoordinate(row.slice(20, 30));
    symbols.push(row.slice(31, 34).trim());
    charges[i] = CHARGE_CODES[row.slice(36, 39).trim()] ?? 0;
  }
  return { positions, symbols, charges };
}

function readBondBlock(lines: readonly string[], countsIndex: number, atomCount: number, bondCount: number): Bond[] {
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
  return recordBonds;
}

function parseMolRecord(record: string): MolRecordParts | null {
  const lines = record.replace(/^\s*\n/, "").split(/\r?\n/);
  const countsIndex = findCountsIndex(lines);
  if (countsIndex < 0) {
    return null;
  }
  const counts = lines[countsIndex] ?? "";
  const atomCount = Number.parseInt(counts.slice(0, 3), 10);
  const bondCount = Number.parseInt(counts.slice(3, 6), 10);
  if (!Number.isFinite(atomCount)) {
    throw new StructureParseError("molCounts");
  }
  const { positions, symbols, charges } = readAtomBlock(lines, countsIndex, atomCount);
  applyPropertyCharges(lines.slice(countsIndex + 1 + atomCount + bondCount), charges);
  const atoms = symbols.map((symbol, i) =>
    makeAtom({ element: elementForSymbol(symbol), serial: i + 1, formalCharge: charges[i] ?? 0 }),
  );
  const bonds = readBondBlock(lines, countsIndex, atomCount, bondCount);
  return { atoms, bonds, positions, title: (lines[0] ?? "").trim() };
}

export function parseMol(text: string, fallbackTitle: string): Structure {
  const records = text.split(/^\$\$\$\$\s*$/m).filter((r) => r.trim().length > 0);
  let atoms: Atom[] = [];
  let bonds: Bond[] = [];
  let title = "";
  const frames: Frame[] = [];
  for (const record of records) {
    const parts = parseMolRecord(record);
    if (parts === null) {
      continue;
    }
    if (frames.length === 0) {
      atoms = parts.atoms;
      bonds = parts.bonds;
      title = parts.title;
    } else if (!framesCompatible(atoms, parts.atoms, bonds, parts.bonds)) {
      throw new StructureParseError("incompatibleFrames");
    }
    frames.push({ comment: parts.title, positions: parts.positions, vibrations: null });
  }
  if (frames.length === 0) {
    throw new StructureParseError("empty");
  }
  // PubChem SDF titles are bare CIDs; prefer the caller's name then.
  const usefulTitle = /^\d*$/.test(title) ? fallbackTitle : title;
  return buildStructure({ title: usefulTitle, format: "MOL", atoms, frames, bonds, perceive: bonds.length === 0 });
}

/**
 * The properties block. Per the CTfile spec, any `M  CHG` or `M  RAD` line supersedes every
 * atom-block charge, so those reset to zero before the `M  CHG` entries (`M  CHGnn8 aaa vvv …`) apply.
 */
function applyPropertyCharges(lines: readonly string[], charges: number[]): void {
  const properties: string[] = [];
  for (const line of lines) {
    if (line.startsWith("M  END")) {
      break;
    }
    properties.push(line);
  }
  if (!properties.some((l) => l.startsWith("M  CHG") || l.startsWith("M  RAD"))) {
    return;
  }
  charges.fill(0);
  for (const line of properties.filter((l) => l.startsWith("M  CHG"))) {
    const [count = 0, ...pairs] = line.slice(6).trim().split(/\s+/).map(Number);
    for (let k = 0; k < count; k++) {
      const atom = (pairs[2 * k] ?? 0) - 1;
      const value = pairs[2 * k + 1];
      if (atom >= 0 && atom < charges.length && Number.isInteger(value)) {
        charges[atom] = value ?? 0;
      }
    }
  }
}
