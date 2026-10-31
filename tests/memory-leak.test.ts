/**
 * Memory-leak regression suite (fleet standard).
 *
 * List every model/view object that links Properties, adds listeners, or owns child
 * nodes, with a factory that builds a fresh instance. The shared harness in
 * tests/helpers/memoryLeak.ts (template-owned) checks that each one is garbage
 * collected after dispose() and leaves no survivors across repeated cycles
 * (idempotentDispose: true also checks a second dispose()). Add sim-specific leak
 * tests below using forceGC().
 */

import { Bounds2 } from "scenerystack/dot";
import { Node } from "scenerystack/scenery";
import { ColorScheme } from "../src/common/model/ColorSchemes.js";
import { DisplayStyle, SMALL_MOLECULE_STYLES } from "../src/common/model/DisplayState.js";
import { LibraryCategory } from "../src/common/model/library/StructureLibrary.js";
import { PickingMode } from "../src/common/model/ScriptEngine.js";
import { ViewerModel } from "../src/common/model/ViewerModel.js";
import { MoleculeViewerNode } from "../src/common/view/MoleculeViewerNode.js";
import { ScriptConsoleNode } from "../src/common/view/ScriptConsoleNode.js";
import { StructureInfoPanel } from "../src/common/view/StructureInfoPanel.js";
import { ViewerControlPanel } from "../src/common/view/ViewerControlPanel.js";
import { describeDisposalLeaks } from "./helpers/memoryLeak.js";

// One long-lived model, as in the sim: the views below must not leak into it.
const model = new ViewerModel({
  category: LibraryCategory.MOLECULES,
  defaultEntryId: "water",
  defaultStyle: DisplayStyle.BALL_AND_STICK,
  defaultColorScheme: ColorScheme.ELEMENT,
});

describeDisposalLeaks([
  {
    name: "CrystalControlPanel",
    create: () =>
      new ViewerControlPanel(model, new Node(), {
        styles: SMALL_MOLECULE_STYLES,
        colorSchemes: [ColorScheme.ELEMENT],
        showBiomoleculeOptions: false,
        showCrystalOptions: true,
        openFile: () => undefined,
        width: 236,
      }),
  },
  { name: "MoleculeViewerNode", create: () => new MoleculeViewerNode(model, new Bounds2(0, 0, 400, 300)) },
  {
    name: "StructureInfoPanel",
    create: () => new StructureInfoPanel(model, 200, [PickingMode.ROTATE, PickingMode.DISTANCE]),
  },
  { name: "ScriptConsoleNode", create: () => new ScriptConsoleNode(model, new Bounds2(0, 0, 400, 90)) },
  {
    name: "ViewerControlPanel",
    create: () =>
      new ViewerControlPanel(model, new Node(), {
        styles: SMALL_MOLECULE_STYLES,
        colorSchemes: [ColorScheme.ELEMENT],
        showBiomoleculeOptions: false,
        showCrystalOptions: false,
        openFile: () => undefined,
        width: 220,
      }),
  },
]);
