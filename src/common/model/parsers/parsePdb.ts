/**
 * parsePdb.ts
 *
 * Protein Data Bank format: ATOM/HETATM coordinates (first alternate location
 * only), HELIX/SHEET secondary structure, CONECT bonds for ligands, CRYST1 cell,
 * and MODEL/ENDMDL ensembles (frames, when every model has the same atoms).
 */

import { elementForSymbol, elementFromLabel, isElementSymbol } from "../Elements.js";
import type { Atom, Bond, Frame, Structure } from "../Structure.js";
import { SecondaryStructure } from "../Structure.js";
import type { StructureRange } from "../StructureBuilder.js";
import { buildStructure } from "../StructureBuilder.js";
import { UnitCell } from "../UnitCell.js";
import { makeAtom, parseCoordinate, StructureParseError } from "./makeAtom.js";

export function parsePdb(text: string, fallbackTitle: string): Structure {
  const lines = text.split(/\r?\n/);
  const atoms: Atom[] = [];
  const ranges: StructureRange[] = [];
  const conect: [number, number][] = [];
  const frames: Frame[] = [];
  let current: number[] = [];
  let modelIndex = 0;
  let title = "";
  let header = "";
  let unitCell: UnitCell | null = null;

  const closeModel = () => {
    if (current.length > 0) {
      if (frames.length === 0 || current.length === 3 * atoms.length) {
        frames.push({ comment: `Model ${frames.length + 1}`, positions: Float64Array.from(current), vibrations: null });
      }
      current = [];
    }
  };

  for (const line of lines) {
    const record = line.slice(0, 6);
    if (record === "ATOM  " || record === "HETATM") {
      const altLoc = line[16] ?? " ";
      if (altLoc !== " " && altLoc !== "A" && altLoc !== "1") {
        continue;
      }
      current.push(
        parseCoordinate(line.slice(30, 38)),
        parseCoordinate(line.slice(38, 46)),
        parseCoordinate(line.slice(46, 54)),
      );
      if (modelIndex > 1) {
        continue; // Later models contribute coordinates only.
      }
      const name = line.slice(12, 16).trim();
      const residueName = line.slice(17, 20).trim();
      const symbolField = line.slice(76, 78).trim();
      const element = isElementSymbol(symbolField)
        ? elementForSymbol(symbolField)
        : elementFromLabel(line.slice(12, 14).trim() || name);
      const chargeField = line.slice(78, 80).trim();
      const charge = chargeField ? Number.parseInt(chargeField, 10) * (chargeField.endsWith("-") ? -1 : 1) : 0;
      atoms.push(
        makeAtom({
          element,
          serial: Number.parseInt(line.slice(6, 11), 10),
          name,
          residueName,
          residueNumber: Number.parseInt(line.slice(22, 26), 10),
          chain: line.slice(21, 22).trim(),
          hetero: record === "HETATM",
          occupancy: Number(line.slice(54, 60)) || 1,
          bFactor: Number(line.slice(60, 66)) || 0,
          formalCharge: Number.isFinite(charge) ? charge : 0,
        }),
      );
    } else if (record === "MODEL ") {
      closeModel();
      modelIndex++;
    } else if (record === "ENDMDL") {
      closeModel();
    } else if (record === "HELIX ") {
      ranges.push({
        kind: SecondaryStructure.HELIX,
        chain: line.slice(19, 20).trim(),
        start: Number.parseInt(line.slice(21, 25), 10),
        end: Number.parseInt(line.slice(33, 37), 10),
      });
    } else if (record === "SHEET ") {
      ranges.push({
        kind: SecondaryStructure.SHEET,
        chain: line.slice(21, 22).trim(),
        start: Number.parseInt(line.slice(22, 26), 10),
        end: Number.parseInt(line.slice(33, 37), 10),
      });
    } else if (record === "CONECT") {
      const from = Number.parseInt(line.slice(6, 11), 10);
      for (const start of [11, 16, 21, 26]) {
        const to = Number.parseInt(line.slice(start, start + 5), 10);
        if (Number.isFinite(from) && Number.isFinite(to)) {
          conect.push([from, to]);
        }
      }
    } else if (record === "HEADER") {
      header = line.slice(62, 66).trim() || line.slice(10, 50).trim();
    } else if (record === "TITLE ") {
      title = `${title} ${line.slice(10).trim()}`.trim();
    } else if (record === "CRYST1") {
      const a = Number(line.slice(6, 15));
      // Cryo-EM and NMR entries write a dummy 1 Å cell; ignore it.
      if (a > 1.5) {
        unitCell = new UnitCell(
          {
            a,
            b: Number(line.slice(15, 24)),
            c: Number(line.slice(24, 33)),
            alpha: Number(line.slice(33, 40)),
            beta: Number(line.slice(40, 47)),
            gamma: Number(line.slice(47, 54)),
          },
          line.slice(55, 66).trim(),
        );
      }
    }
  }
  closeModel();
  if (atoms.length === 0) {
    throw new StructureParseError("empty");
  }

  // CONECT records give HETATM connectivity (and bond order by repetition, ignored here).
  const bySerial = new Map<number, number>();
  atoms.forEach((atom, index) => {
    bySerial.set(atom.serial, index);
  });
  const bonds: Bond[] = [];
  for (const [from, to] of conect) {
    const a = bySerial.get(from);
    const b = bySerial.get(to);
    if (a !== undefined && b !== undefined && a < b) {
      bonds.push({ a, b, order: 1 });
    }
  }

  const fullTitle = [header, title].filter((s) => s.length > 0).join(": ") || fallbackTitle;
  return buildStructure({ title: fullTitle, format: "PDB", atoms, frames, bonds, ranges, unitCell });
}
