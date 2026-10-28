/**
 * parseStructure.ts
 *
 * Format detection and dispatch, from a file name extension when there is one and
 * from the content otherwise (as Jmol does for pasted data).
 */

import type { Vec3 } from "../Geometry.js";
import type { Structure } from "../Structure.js";
import { StructureParseError } from "./makeAtom.js";
import { parseCif } from "./parseCif.js";
import { parseMol } from "./parseMol.js";
import { parsePdb } from "./parsePdb.js";
import { parseXyz } from "./parseXyz.js";

export const StructureFormat = {
  PDB: "pdb",
  MOL: "mol",
  XYZ: "xyz",
  CIF: "cif",
} as const;
export type StructureFormatValue = (typeof StructureFormat)[keyof typeof StructureFormat];

/** File extensions the open-file dialog accepts. */
export const ACCEPTED_EXTENSIONS = [".pdb", ".ent", ".mol", ".sdf", ".mdl", ".xyz", ".cif"];

export function detectFormat(text: string, fileName = ""): StructureFormatValue {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdb" || ext === "ent") {
    return StructureFormat.PDB;
  }
  if (ext === "mol" || ext === "sdf" || ext === "mdl") {
    return StructureFormat.MOL;
  }
  if (ext === "xyz") {
    return StructureFormat.XYZ;
  }
  if (ext === "cif") {
    return StructureFormat.CIF;
  }
  if (/^\s*\d+\s*\r?\n/.test(text)) {
    return StructureFormat.XYZ;
  }
  if (/V2000|V3000/.test(text.slice(0, 2000))) {
    return StructureFormat.MOL;
  }
  if (/^data_/m.test(text) && /_cell_length_a/.test(text)) {
    return StructureFormat.CIF;
  }
  if (/^(ATOM {2}|HETATM)/m.test(text)) {
    return StructureFormat.PDB;
  }
  throw new StructureParseError("unknownFormat");
}

/**
 * Parses any supported format.
 * @param range - unit cells to pack along a, b, c (CIF only)
 */
export function parseStructure(text: string, fileName = "", title = "", range: Vec3 = [1, 1, 1]): Structure {
  const fallback = title || fileName.replace(/\.[^.]+$/, "") || "structure";
  switch (detectFormat(text, fileName)) {
    case StructureFormat.PDB:
      return parsePdb(text, fallback);
    case StructureFormat.MOL:
      return parseMol(text, fallback);
    case StructureFormat.XYZ:
      return parseXyz(text, fallback);
    case StructureFormat.CIF:
      return parseCif(text, fallback, range);
    default:
      throw new StructureParseError("unknownFormat");
  }
}
