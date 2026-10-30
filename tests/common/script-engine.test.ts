import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Node } from "scenerystack/scenery";
import { beforeEach, describe, expect, it } from "vitest";
import { ColorScheme } from "../../src/common/model/ColorSchemes.js";
import { DisplayStyle, SMALL_MOLECULE_STYLES, WIREFRAME_LINE } from "../../src/common/model/DisplayState.js";
import { LibraryCategory } from "../../src/common/model/library/StructureLibrary.js";
import { parseStructure } from "../../src/common/model/parsers/parseStructure.js";
import { ScriptMessageKey, splitCommands } from "../../src/common/model/ScriptEngine.js";
import { CUSTOM_ENTRY_ID, ViewerModel } from "../../src/common/model/ViewerModel.js";
import { ViewerControlPanel } from "../../src/common/view/ViewerControlPanel.js";

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
    // A prime after a letter is part of a nucleic-acid atom name, not an opening quote.
    expect(splitCommands("select .C4'; color red")).toEqual(["select .C4'", "color red"]);
    expect(splitCommands("echo 'a;b'; spin on")).toEqual(["echo 'a;b'", "spin on"]);
  });

  it("keeps hidden hydrogens hidden through style changes and the hydrogens toggle", async () => {
    await model.runScript("hide hydrogen; style wireframe");
    const state = model.displayState!;
    const h = state.structure.atoms.findIndex((a) => a.element.number === 1);
    expect(state.hidden[h]).toBe(1);
    model.showHydrogensProperty.value = false;
    model.showHydrogensProperty.value = true;
    expect(state.hidden[h]).toBe(1);
    await model.runScript("display hydrogen");
    expect(state.hidden[h]).toBe(0);
    model.showHydrogensProperty.value = false;
    expect(state.hidden[h]).toBe(1);
  });

  it("selects all or none and re-applies the menus to the selection", async () => {
    const state = model.displayState!;
    model.selectNone();
    expect(state.selectedCount()).toBe(0);
    expect(model.selectionHalosProperty.value).toBe(true);
    await model.runScript("select nitrogen; spacefill off");
    const n = state.structure.atoms.findIndex((a) => a.element.symbol === "N");
    const c = state.structure.atoms.findIndex((a) => a.element.symbol === "C");
    const carbonRadius = state.atomRadius[c];
    // The style menu still reads Ball & stick, so choosing it again would do nothing; Apply does.
    model.applyToSelection(DisplayStyle.BALL_AND_STICK, ColorScheme.ELEMENT, "none");
    expect(state.atomRadius[n]).toBeGreaterThan(0);
    expect(state.atomRadius[c]).toBe(carbonRadius);
    model.selectAll();
    expect(state.selectedCount()).toBe(state.atomCount);
    expect(model.selectionHalosProperty.value).toBe(false);
  });

  it("loads another screen's entry as a custom structure", async () => {
    const panel = new ViewerControlPanel(model, new Node(), {
      styles: SMALL_MOLECULE_STYLES,
      colorSchemes: [ColorScheme.ELEMENT],
      showBiomoleculeOptions: false,
      showCrystalOptions: false,
      openFile: () => undefined,
      width: 220,
    });
    const messages = await model.runScript("load 1crn");
    expect(messages[0]?.key).toBe(ScriptMessageKey.LOADED);
    expect(model.entryIdProperty.value).toBe(CUSTOM_ENTRY_ID);
    expect(model.structure?.isBiomolecule).toBe(true);
    panel.dispose();
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

  it("ignores picks and measurements outside the structure", async () => {
    const model = makeModel();
    await model.loadEntry("water");
    model.pickingModeProperty.value = "distance";
    model.pickAtom(0);
    model.pickAtom(23); // a stale index from caffeine
    expect(model.pendingPicksProperty.value).toEqual([0]);
    expect(model.addMeasurement([0, 23])).toBeNull();
    expect(model.measurementsProperty.value).toHaveLength(0);
  });

  it("recomputes hydrogen bonds for each trajectory frame", () => {
    const model = makeModel();
    model.setStructure(parseStructure("2\nnear\nO 0 0 0\nO 3 0 0\n2\nfar\nO 0 0 0\nO 8 0 0\n", "pair.xyz"));
    expect(model.hydrogenBonds()).toHaveLength(1);
    model.setFrame(1);
    expect(model.hydrogenBonds()).toHaveLength(0);
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
