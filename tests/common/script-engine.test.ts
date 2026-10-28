import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ColorScheme } from "../../src/common/model/ColorSchemes.js";
import { DisplayStyle, WIREFRAME_LINE } from "../../src/common/model/DisplayState.js";
import { LibraryCategory } from "../../src/common/model/library/StructureLibrary.js";
import { ScriptMessageKey, splitCommands } from "../../src/common/model/ScriptEngine.js";
import { CUSTOM_ENTRY_ID, ViewerModel } from "../../src/common/model/ViewerModel.js";

const DATA = join(process.cwd(), "src/common/model/library/data");

function makeModel(fetched: string[] = []) {
  return new ViewerModel({
    category: LibraryCategory.MOLECULES,
    defaultEntryId: "caffeine",
    defaultStyle: DisplayStyle.BALL_AND_STICK,
    defaultColorScheme: ColorScheme.ELEMENT,
    fetchText: (url) => {
      fetched.push(url);
      return Promise.resolve(readFileSync(join(DATA, url.includes("rcsb") ? "1crn.pdb" : "aspirin.mol"), "utf8"));
    },
  });
}

describe("ScriptEngine", () => {
  let model: ViewerModel;
  beforeEach(async () => {
    model = makeModel();
    await model.loadEntry("caffeine");
  });

  it("splits commands on semicolons and newlines, ignoring comments", () => {
    expect(splitCommands("select carbon; color red # paint\nspin on")).toEqual([
      "select carbon",
      "color red",
      "spin on",
    ]);
    expect(splitCommands('echo "a;b"')).toEqual(['echo "a;b"']);
  });

  it("selects and styles only the selection, like Jmol", async () => {
    const messages = await model.runScript("select nitrogen; spacefill 100%; color yellow");
    expect(messages[0]?.key).toBe(ScriptMessageKey.SELECTED);
    expect(messages[0]?.args["count"]).toBe(4);
    const state = model.displayState!;
    const n = state.structure.atoms.findIndex((a) => a.element.symbol === "N");
    const c = state.structure.atoms.findIndex((a) => a.element.symbol === "C");
    expect(state.atomRadius[n]).toBeCloseTo(1.55);
    expect(state.colors[n]).toBe(0xffff00);
    expect(state.colors[c]).toBe(0x909090);
  });

  it("supports wireframe, labels and colour schemes", async () => {
    await model.runScript("select all; wireframe on; label %e; color cpk");
    const state = model.displayState!;
    expect(state.bondRadius[0]).toBe(WIREFRAME_LINE);
    expect(state.labels[0]).toBe(state.structure.atoms[0]?.element.symbol);
  });

  it("measures by atom serial number", async () => {
    const messages = await model.runScript("measure 1 2");
    expect(messages[0]?.key).toBe(ScriptMessageKey.MEASURED);
    expect(model.measurementsProperty.value).toHaveLength(1);
    await model.runScript("measure off");
    expect(model.measurementsProperty.value).toHaveLength(0);
  });

  it("drives camera and toggles", async () => {
    await model.runScript("spin on; zoom 200; set picking distance; hbonds on");
    expect(model.spinProperty.value).toBe(true);
    expect(model.zoomProperty.value).toBe(2);
    expect(model.pickingModeProperty.value).toBe("distance");
    expect(model.hydrogenBondsProperty.value).toBe(true);
    model.step(1);
    expect(model.rotationProperty.value).not.toBe(null);
  });

  it("reports errors and stops the script", async () => {
    const messages = await model.runScript("frobnicate; spin on");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.isError).toBe(true);
    expect(model.spinProperty.value).toBe(false);
    const bad = await model.runScript("select (carbon");
    expect(bad[0]?.key).toBe(ScriptMessageKey.BAD_SELECTION);
  });

  it("loads from the library, PubChem and RCSB", async () => {
    const fetched: string[] = [];
    const m = makeModel(fetched);
    await m.runScript("load benzene");
    expect(m.entryIdProperty.value).toBe("benzene");
    await m.runScript("load $aspirin");
    expect(fetched[0]).toContain("pubchem");
    expect(m.entryIdProperty.value).toBe(CUSTOM_ENTRY_ID);
    await m.runScript("load =1crn");
    expect(fetched[1]).toContain("files.rcsb.org/download/1CRN.pdb");
    expect(m.structure?.isBiomolecule).toBe(true);
  });
});

describe("ViewerModel picking", () => {
  it("builds measurements from successive picks", async () => {
    const model = makeModel();
    await model.loadEntry("water");
    model.pickingModeProperty.value = "angle";
    model.pickAtom(1);
    model.pickAtom(0);
    expect(model.measurementsProperty.value).toHaveLength(0);
    model.pickAtom(2);
    const [m] = model.measurementsProperty.value;
    expect(m).toBeDefined();
    expect(model.measurementValue(m!)).toBeGreaterThan(100);
    expect(model.measurementValue(m!)).toBeLessThan(110);
  });

  it("animates vibrations and frames", async () => {
    const model = makeModel();
    await model.loadEntry("water-vibrations");
    expect(model.vibrationProperty.value).toBe(true);
    const before = model.currentPositions().slice();
    model.step(0.25);
    expect(model.currentPositions()[3]).not.toBeCloseTo(before[3]!, 5);
    model.setFrame("next");
    expect(model.frameIndexProperty.value).toBe(1);
  });
});
