import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ColorScheme } from "../../src/common/model/ColorSchemes.js";
import { DisplayStyle } from "../../src/common/model/DisplayState.js";
import { LibraryCategory } from "../../src/common/model/library/StructureLibrary.js";
import { parseStructure } from "../../src/common/model/parsers/parseStructure.js";
import { ViewerModel } from "../../src/common/model/ViewerModel.js";

const read = (file: string) => readFileSync(join(process.cwd(), "src/common/model/library/data", file), "utf8");
const water = read("water.mol");
const cif = read("cod-1000041.cif");

function makeModel(fetchText?: (url: string) => Promise<string>) {
  return new ViewerModel({
    category: LibraryCategory.CRYSTALS,
    defaultEntryId: "sodium-chloride",
    defaultStyle: DisplayStyle.BALL_AND_STICK,
    defaultColorScheme: ColorScheme.ELEMENT,
    ...(fetchText ? { fetchText } : {}),
  });
}

describe("compatible multi-frame structures", () => {
  it("keeps compatible conformers even when bond endpoints are reversed", () => {
    const lines = water.split("\n");
    lines[7] = "  2  1  1  0  0  0  0";
    const structure = parseStructure(`${water}\n$$$$\n${lines.join("\n")}`, "conformers.sdf");
    expect(structure.frames).toHaveLength(2);
  });

  it("rejects a same-size SDF record with different elements", () => {
    expect(() => parseStructure(`${water}\n$$$$\n${read("carbon-dioxide.mol")}`, "mixed.sdf")).toThrow(
      "incompatibleFrames",
    );
  });

  it("rejects a different formal charge", () => {
    const charged = water.replace("M  END", "M  CHG  1   1  -1\nM  END");
    expect(() => parseStructure(`${water}\n$$$$\n${charged}`, "charges.sdf")).toThrow("incompatibleFrames");
  });

  it("rejects different bond orders", () => {
    const changed = water.split("\n");
    changed[7] = "  1  2  2  0  0  0  0";
    expect(() => parseStructure(`${water}\n$$$$\n${changed.join("\n")}`, "bonds.sdf")).toThrow("incompatibleFrames");
  });

  it("rejects a different XYZ atom sequence", () => {
    expect(() => parseStructure("2\nfirst\nH 0 0 0\nO 1 0 0\n2\nsecond\nO 0 0 0\nH 1 0 0\n", "mixed.xyz")).toThrow(
      "incompatibleFrames",
    );
  });
});

describe("coordinate validation preserves the active structure", () => {
  const badMol = water.replace("    0.0000", "      nope");
  const pdb = read("1crn.pdb").split("\n");
  const atomIndex = pdb.findIndex((line) => line.startsWith("ATOM  "));
  pdb[atomIndex] = `${pdb[atomIndex]!.slice(0, 30)}    nope${pdb[atomIndex]!.slice(38)}`;
  const badCif = cif.replace("Na1 Na1+ 4 a 0.", "Na1 Na1+ 4 a ?");

  it.each([
    ["bad.xyz", "2\nbad\nH nope 0 0\nH 0 0 1\n"],
    ["vibration.xyz", "1\nbad\nH 0 0 0 Infinity 0 0\n"],
    ["bad.mol", badMol],
    ["bad.pdb", pdb.join("\n")],
    ["bad.cif", badCif],
  ])("rejects %s without changing the molecule or camera", async (name, text) => {
    const model = makeModel();
    await model.loadEntry("sodium-chloride");
    const structure = model.structure;
    const state = model.displayState;
    const center = model.centerProperty.value;
    const radius = model.radiusProperty.value;
    expect(() => model.loadText(text, name)).toThrow("invalidCoordinates");
    expect(model.structure).toBe(structure);
    expect(model.displayState).toBe(state);
    expect(model.entryIdProperty.value).toBe("sodium-chloride");
    expect(model.centerProperty.value).toBe(center);
    expect(model.radiusProperty.value).toBe(radius);
  });

  it("validates direct structure installation before changing state", async () => {
    const model = makeModel();
    await model.loadEntry("sodium-chloride");
    const previous = model.structure;
    const structure = parseStructure(water, "water.mol");
    const positions = structure.frames[0]!.positions.slice();
    positions[0] = Number.NaN;
    expect(() => model.setStructure({ ...structure, frames: [{ ...structure.frames[0]!, positions }] })).toThrow(
      "invalidCoordinates",
    );
    expect(model.structure).toBe(previous);
  });
});

describe("actual crystal packing", () => {
  it("retains non-cubic dimensions, then returns to a cubic preset", async () => {
    const model = makeModel();
    await model.runScript("load nacl {1 2 3}");
    expect(model.structure?.cellRange).toEqual([1, 2, 3]);
    expect(model.structure?.atoms).toHaveLength(105);
    expect(model.cellRangeProperty.value).toBe(0);
    model.cellRangeProperty.value = 2;
    await expect.poll(() => model.structure?.atoms.length).toBe(125);
    expect(model.structure?.cellRange).toEqual([2, 2, 2]);
    model.reset();
    await expect.poll(() => model.structure?.atoms.length).toBe(27);
    expect(model.cellRangeProperty.value).toBe(1);
  });

  it("initializes a custom CIF as one cell and can repack it", async () => {
    const model = makeModel();
    await model.runScript("load nacl {3 3 3}");
    model.loadText(cif, "halite.cif");
    expect(model.structure?.cellRange).toEqual([1, 1, 1]);
    expect(model.cellRangeProperty.value).toBe(1);
    expect(model.structure?.atoms).toHaveLength(27);
    model.cellRangeProperty.value = 2;
    await expect.poll(() => model.structure?.atoms.length).toBe(125);
    expect(model.structure?.cellRange).toEqual([2, 2, 2]);
  });
});

describe("superseded script operations", () => {
  for (const action of ["reset", "library", "file", "script"] as const) {
    it.each(["resolve", "reject"] as const)(
      `${action} cancels old commands and output after late %s`,
      async (result) => {
        let resolve!: (text: string) => void;
        let reject!: (error: Error) => void;
        const response = new Promise<string>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        const model = makeModel(() => response);
        await model.loadEntry("sodium-chloride");
        const old = model.runScript("load $water; color red; spin on");
        if (action === "reset") {
          model.reset();
          await expect.poll(() => model.loadStateProperty.value).toBe("idle");
        } else if (action === "library") {
          await model.loadEntry("diamond");
        } else if (action === "file") {
          model.loadText(water, "water.mol");
        } else {
          await model.runScript("color blue");
        }
        const structure = model.structure;
        const lines = model.consoleLinesProperty.value;
        if (result === "resolve") {
          resolve(water);
        } else {
          reject(new Error("late network failure"));
        }
        expect(await old).toEqual([]);
        expect(model.structure).toBe(structure);
        expect(model.spinProperty.value).toBe(false);
        expect(model.displayState!.colors[0]).not.toBe(0xff0000);
        expect(model.consoleLinesProperty.value).toBe(lines);
        expect(model.loadStateProperty.value).toBe("idle");
      },
    );
  }
});
