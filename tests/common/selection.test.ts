import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateSelection,
  type SelectionContext,
  SelectionSyntaxError,
} from "../../src/common/model/AtomSelection.js";
import { parseStructure } from "../../src/common/model/parsers/parseStructure.js";
import type { Structure } from "../../src/common/model/Structure.js";

const DATA = join(process.cwd(), "src/common/model/library/data");
let structure: Structure;
let context: SelectionContext;
const count = (expr: string) => evaluateSelection(expr, context).reduce((a, b) => a + b, 0);

beforeAll(() => {
  structure = parseStructure(readFileSync(join(DATA, "1crn.pdb"), "utf8"), "1crn.pdb");
  context = {
    structure,
    frame: structure.frames[0]!,
    selected: new Uint8Array(structure.atoms.length),
    isDisplayed: () => true,
  };
});

describe("Jmol atom expressions", () => {
  it("handles keywords and element names", () => {
    expect(count("all")).toBe(327);
    expect(count("none")).toBe(0);
    expect(count("protein")).toBe(327);
    expect(count("sulfur")).toBe(6);
    expect(count("_S")).toBe(6);
    expect(count("element=S")).toBe(6);
  });

  it("handles residue specs, ranges, chains and atom names", () => {
    expect(count("*.CA")).toBe(46);
    expect(count("CYS")).toBe(36);
    expect(count("[CYS].SG")).toBe(6);
    expect(count("1-5.CA")).toBe(5);
    expect(count(":A.CA")).toBe(46);
    expect(count("3:A")).toBeGreaterThan(0);
  });

  it("handles comparisons and boolean logic", () => {
    expect(count("atomno<=10")).toBe(10);
    expect(count("atomno<=10 and not carbon")).toBe(count("atomno<=10") - count("atomno<=10 and carbon"));
    expect(count("sulfur or oxygen")).toBe(count("sulfur") + count("oxygen"));
    expect(count("(sulfur, nitrogen) & resno<10")).toBeGreaterThan(0);
    expect(count("backbone") + count("sidechain")).toBe(327);
    expect(count("helix")).toBeGreaterThan(0);
  });

  it("evaluates within()", () => {
    const near = count("within(3.0, [CYS].SG)");
    expect(near).toBeGreaterThan(6);
    expect(near).toBeLessThan(60);
  });

  it("rejects nonsense", () => {
    expect(() => evaluateSelection("frobnicate", context)).toThrow(SelectionSyntaxError);
    expect(() => evaluateSelection("(carbon", context)).toThrow(SelectionSyntaxError);
  });
});
