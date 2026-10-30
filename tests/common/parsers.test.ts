import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formulaString, hillFormula } from "../../src/common/model/Composition.js";
import { parseCif } from "../../src/common/model/parsers/parseCif.js";
import { parseStructure } from "../../src/common/model/parsers/parseStructure.js";
import { SecondaryStructure, SecondaryStructureSource } from "../../src/common/model/Structure.js";

const DATA = join(process.cwd(), "src/common/model/library/data");
const read = (file: string) => readFileSync(join(DATA, file), "utf8");

describe("MOL parser", () => {
  it("reads caffeine with bond orders and the right formula", () => {
    const s = parseStructure(read("caffeine.mol"), "caffeine.mol", "Caffeine");
    expect(s.atoms).toHaveLength(24);
    expect(formulaString(hillFormula(s))).toBe("C8H10N4O2");
    expect(s.bonds).toHaveLength(25);
    expect(s.bonds.filter((b) => b.order === 2).length).toBeGreaterThan(0);
    expect(s.title).toBe("Caffeine"); // PubChem's numeric title is replaced
  });

  it("lets M  CHG supersede the atom-block charge codes", () => {
    const mol = (properties: string[]) =>
      [
        "ions",
        "",
        "",
        "  2  0  0  0  0  0  0  0  0  0999 V2000",
        "    0.0000    0.0000    0.0000 Na  0  3  0  0  0  0  0  0  0  0  0  0",
        "    3.0000    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0",
        ...properties,
        "M  END",
      ].join("\n");
    expect(parseStructure(mol([]), "a.mol").atoms.map((a) => a.formalCharge)).toEqual([1, 0]);
    // Any M  CHG line resets every atom-block charge, including Na's +1 code.
    expect(parseStructure(mol(["M  CHG  1   2  -1"]), "b.mol").atoms.map((a) => a.formalCharge)).toEqual([0, -1]);
  });
});

describe("XYZ parser", () => {
  it("perceives bonds and reads vibration modes as frames", () => {
    const s = parseStructure(read("water-vibrations.xyz"), "water-vibrations.xyz");
    expect(s.atoms).toHaveLength(3);
    expect(s.frames).toHaveLength(3);
    expect(s.frames[0]?.vibrations).not.toBeNull();
    expect(s.bonds).toHaveLength(2);
  });

  it("builds a 60-atom, 90-bond buckyball", () => {
    const s = parseStructure(read("buckminsterfullerene.xyz"), "c60.xyz");
    expect(s.atoms).toHaveLength(60);
    expect(s.bonds).toHaveLength(90);
  });

  it("loads a 36-frame torsion scan", () => {
    expect(parseStructure(read("ethane-rotation.xyz"), "e.xyz").frames).toHaveLength(36);
  });
});

describe("PDB parser", () => {
  it("reads crambin with residues and HELIX/SHEET structure", () => {
    const s = parseStructure(read("1crn.pdb"), "1crn.pdb");
    expect(s.atoms).toHaveLength(327);
    expect(s.isBiomolecule).toBe(true);
    expect(s.residues.filter((r) => r.leadAtom >= 0)).toHaveLength(46);
    expect(s.atoms.some((a) => a.secondaryStructure === SecondaryStructure.HELIX)).toBe(true);
    expect(s.atoms.some((a) => a.secondaryStructure === SecondaryStructure.SHEET)).toBe(true);
    expect(s.secondaryStructureSource).toBe(SecondaryStructureSource.FILE);
    expect(s.unitCell).not.toBeNull();
    // Crambin has three disulfide bridges, found by distance bonding.
    const sg = s.atoms.map((a, i) => (a.name === "SG" ? i : -1)).filter((i) => i >= 0);
    const ss = s.bonds.filter((b) => sg.includes(b.a) && sg.includes(b.b));
    expect(ss).toHaveLength(3);
  });

  it("reads hemoglobin's four chains and heme ligands", () => {
    const s = parseStructure(read("4hhb.pdb"), "4hhb.pdb");
    expect(new Set(s.atoms.map((a) => a.chain))).toEqual(new Set(["A", "B", "C", "D"]));
    expect(s.residues.filter((r) => r.name === "HEM")).toHaveLength(4);
  });

  it("falls back to Cα geometry without HELIX/SHEET records, and says so", () => {
    const text = read("1crn.pdb")
      .split("\n")
      .filter((l) => !/^(HELIX|SHEET)/.test(l))
      .join("\n");
    const s = parseStructure(text, "1crn.pdb");
    expect(s.secondaryStructureSource).toBe(SecondaryStructureSource.GEOMETRY);
    expect(s.atoms.some((a) => a.secondaryStructure === SecondaryStructure.HELIX)).toBe(true);
    // DNA has no protein residues, so there is no secondary structure to report.
    expect(parseStructure(read("1bna.pdb"), "1bna.pdb").secondaryStructureSource).toBe(SecondaryStructureSource.NONE);
  });
});

describe("CIF parser", () => {
  it("packs rock salt into the 27-site conventional cell", () => {
    const s = parseCif(read("cod-1000041.cif"), "nacl");
    // 8 corners + 6 faces = 14 Na-type, 12 edges + 1 body = 13 Cl-type (or vice versa).
    expect(s.atoms).toHaveLength(27);
    expect(s.unitCell?.parameters.a).toBeCloseTo(5.62, 1);
    // Like ions are never bonded.
    expect(s.bonds.every((b) => s.atoms[b.a]?.element !== s.atoms[b.b]?.element)).toBe(true);
  });

  it("packs quartz from six symmetry operators", () => {
    const s = parseCif(read("cod-1011097.cif"), "quartz");
    const si = s.atoms.filter((a) => a.element.symbol === "Si").length;
    expect(si).toBeGreaterThanOrEqual(3);
    expect(s.atoms.filter((a) => a.element.symbol === "O").length).toBeGreaterThanOrEqual(6);
  });

  it("replicates cells on request", () => {
    expect(parseCif(read("cod-1000041.cif"), "nacl", [2, 2, 2]).atoms).toHaveLength(125);
  });
});

describe("crystal bonding and polyhedra", () => {
  it("bonds perovskite Ti and Ca only to oxygen and builds TiO6 octahedra", async () => {
    const { findPolyhedra } = await import("../../src/common/model/Polyhedra.js");
    const s = parseCif(read("cod-1011211.cif"), "perovskite", [2, 2, 2]);
    const symbol = (i: number) => s.atoms[i]?.element.symbol;
    expect(s.bonds.every((b) => symbol(b.a) === "O" || symbol(b.b) === "O")).toBe(true);
    const polyhedra = findPolyhedra(s, s.frames[0]!.positions);
    expect(polyhedra.length).toBe(8);
    expect(polyhedra.every((p) => symbol(p.center) === "Ti" && p.faces.length === 8)).toBe(true);
  });
});
