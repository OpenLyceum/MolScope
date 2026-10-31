/**
 * parseCif.ts
 *
 * Small-molecule / inorganic CIF (Crystallographic Information File): cell
 * parameters, symmetry operators (`_symmetry_equiv_pos_as_xyz` or
 * `_space_group_symop_operation_xyz`) and fractional atom sites, packed into
 * `range` unit cells. Values with standard uncertainties such as `0.465(4)` are
 * read as 0.465. Only the first data block is used.
 */

import type { ElementData } from "../Elements.js";
import { elementForSymbol, elementFromLabel, isElementSymbol } from "../Elements.js";
import type { Vec3 } from "../Geometry.js";
import type { Atom, Structure } from "../Structure.js";
import { buildStructure } from "../StructureBuilder.js";
import type { CellSite, SymmetryOperator } from "../UnitCell.js";
import { packCell, parseSymmetryOperator, UnitCell } from "../UnitCell.js";
import { makeAtom, StructureParseError } from "./makeAtom.js";

type CifBlock = {
  readonly items: Map<string, string>;
  readonly loops: { readonly tags: string[]; readonly rows: string[][] }[];
};

/** Splits a CIF line into tokens, honouring 'quoted' and "quoted" values. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const re = /'([^']*)'(?=\s|$)|"([^"]*)"(?=\s|$)|(\S+)/g;
  let match = re.exec(line);
  while (match !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
    match = re.exec(line);
  }
  return tokens;
}

export function readCif(text: string): CifBlock {
  const items = new Map<string, string>();
  const loops: CifBlock["loops"] = [];
  const lines = text.split(/\r?\n/);
  const values: string[] = [];
  // Flatten into a token stream, folding ;-delimited text fields into one token.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith(";")) {
      const parts = [line.slice(1)];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith(";")) {
        parts.push(lines[i] ?? "");
        i++;
      }
      values.push(parts.join("\n").trim());
      continue;
    }
    const stripped = line.replace(/(^|\s)#.*$/, "");
    values.push(...tokenize(stripped));
  }

  let blockCount = 0;
  let index = 0;
  while (index < values.length) {
    const token = values[index] ?? "";
    const lower = token.toLowerCase();
    if (lower.startsWith("data_")) {
      blockCount++;
      if (blockCount > 1) {
        break;
      }
      index++;
    } else if (lower === "loop_") {
      index++;
      const tags: string[] = [];
      while (index < values.length && (values[index] ?? "").startsWith("_")) {
        tags.push((values[index] ?? "").toLowerCase());
        index++;
      }
      const flat: string[] = [];
      while (index < values.length) {
        const v = values[index] ?? "";
        const vl = v.toLowerCase();
        if (v.startsWith("_") || vl === "loop_" || vl.startsWith("data_")) {
          break;
        }
        flat.push(v);
        index++;
      }
      const rows: string[][] = [];
      if (tags.length > 0) {
        for (let r = 0; r + tags.length <= flat.length; r += tags.length) {
          rows.push(flat.slice(r, r + tags.length));
        }
      }
      loops.push({ tags, rows });
    } else if (token.startsWith("_")) {
      items.set(lower, values[index + 1] ?? "");
      index += 2;
    } else {
      index++;
    }
  }
  return { items, loops };
}

/** "0.465(4)" → 0.465; "." and "?" → NaN. */
export function cifNumber(value: string | undefined): number {
  if (value === undefined || value === "." || value === "?") {
    return Number.NaN;
  }
  return Number(value.replace(/\(\d+\)$/, ""));
}

function findLoop(block: CifBlock, tag: string) {
  return block.loops.find((loop) => loop.tags.includes(tag)) ?? null;
}

type SiteData = { readonly element: ElementData; readonly label: string; readonly occupancy: number };

export function parseCif(text: string, fallbackTitle: string, range: Vec3 = [1, 1, 1]): Structure {
  const block = readCif(text);
  const num = (tag: string) => cifNumber(block.items.get(tag));
  const parameters = {
    a: num("_cell_length_a"),
    b: num("_cell_length_b"),
    c: num("_cell_length_c"),
    alpha: num("_cell_angle_alpha"),
    beta: num("_cell_angle_beta"),
    gamma: num("_cell_angle_gamma"),
  };
  if (!Object.values(parameters).every((v) => Number.isFinite(v) && v > 0)) {
    throw new StructureParseError("cifCell");
  }
  const spaceGroup =
    block.items.get("_symmetry_space_group_name_h-m") ?? block.items.get("_space_group_name_h-m_alt") ?? "";
  const cell = new UnitCell(parameters, spaceGroup);

  const operators: SymmetryOperator[] = [];
  const symTag = ["_symmetry_equiv_pos_as_xyz", "_space_group_symop_operation_xyz"].find((t) => findLoop(block, t));
  if (symTag) {
    const loop = findLoop(block, symTag);
    const column = loop?.tags.indexOf(symTag) ?? -1;
    for (const row of loop?.rows ?? []) {
      const op = parseSymmetryOperator(row[column] ?? "");
      if (op) {
        operators.push(op);
      }
    }
  }

  const siteLoop = findLoop(block, "_atom_site_fract_x");
  if (!siteLoop) {
    throw new StructureParseError("cifSites");
  }
  const col = (tag: string) => siteLoop.tags.indexOf(tag);
  const [cLabel, cType, cx, cy, cz, cOcc] = [
    col("_atom_site_label"),
    col("_atom_site_type_symbol"),
    col("_atom_site_fract_x"),
    col("_atom_site_fract_y"),
    col("_atom_site_fract_z"),
    col("_atom_site_occupancy"),
  ];
  const sites: CellSite<SiteData>[] = [];
  for (const row of siteLoop.rows) {
    const label = row[cLabel] ?? row[cType] ?? "X";
    const typeSymbol = (row[cType] ?? "").replace(/[\d+-]+$/, "");
    const element = isElementSymbol(typeSymbol) ? elementForSymbol(typeSymbol) : elementFromLabel(label);
    const occupancy = cOcc >= 0 ? cifNumber(row[cOcc]) : 1;
    const fractional: Vec3 = [cifNumber(row[cx]), cifNumber(row[cy]), cifNumber(row[cz])];
    if (!fractional.every(Number.isFinite)) {
      throw new StructureParseError("invalidCoordinates");
    }
    sites.push({
      fractional,
      data: { element, label, occupancy: Number.isFinite(occupancy) ? occupancy : 1 },
    });
  }

  const packed = packCell(sites, operators, range);
  const atoms: Atom[] = [];
  const positions = new Float64Array(3 * packed.length);
  packed.forEach((site, i) => {
    const p = cell.toCartesian(site.fractional);
    positions.set(p, 3 * i);
    atoms.push(
      makeAtom({ element: site.data.element, serial: i + 1, name: site.data.label, occupancy: site.data.occupancy }),
    );
  });

  const mineral = block.items.get("_chemical_name_mineral");
  const common = block.items.get("_chemical_name_common");
  const formula = block.items.get("_chemical_formula_sum");
  const title = [mineral ?? common, formula].filter((s) => s && s !== "?").join(" — ") || fallbackTitle;
  return buildStructure({
    title,
    format: "CIF",
    atoms,
    frames: [{ comment: title, positions, vibrations: null }],
    unitCell: cell,
    cellRange: range,
    skipLikePairs: true,
  });
}
