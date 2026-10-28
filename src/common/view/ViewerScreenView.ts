/**
 * ViewerScreenView.ts
 *
 * The screen layout shared by all three screens, Jmol-style: the 3D viewport in
 * the middle, structure info and mouse modes on the left, display controls on
 * the right, and the script console under the viewport.
 *
 * Each screen supplies its menus (which styles and colour schemes make sense)
 * through {@link ViewerScreenConfig}; the screen summary comes from the subclass.
 */

import { Bounds2 } from "scenerystack/dot";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import { Node } from "scenerystack/scenery";
import { ResetAllButton } from "scenerystack/scenery-phet";
import { ScreenView, type ScreenViewOptions } from "scenerystack/sim";
import { SCREEN_VIEW_MARGIN } from "../../MolScopeConstants.js";
import { FLAT_RESET_ALL_BUTTON_OPTIONS } from "../MolScopeButtonOptions.js";
import type { ColorSchemeValue } from "../model/ColorSchemes.js";
import type { DisplayStyleValue } from "../model/DisplayState.js";
import type { PickingModeValue } from "../model/ScriptEngine.js";
import { PickingMode } from "../model/ScriptEngine.js";
import type { ViewerModel } from "../model/ViewerModel.js";
import { installDropTarget, openFileDialog } from "./FileOpener.js";
import { MoleculeViewerNode } from "./MoleculeViewerNode.js";
import { ScriptConsoleNode } from "./ScriptConsoleNode.js";
import { StructureInfoPanel } from "./StructureInfoPanel.js";
import { ViewerControlPanel } from "./ViewerControlPanel.js";

/** Panel widths and console height, view px. */
export const LEFT_PANEL_WIDTH = 210;
export const RIGHT_PANEL_WIDTH = 236;
export const CONSOLE_HEIGHT = 96;
const GAP = 8;

export type ViewerScreenConfig = {
  readonly styles: readonly DisplayStyleValue[];
  readonly colorSchemes: readonly ColorSchemeValue[];
  readonly showBiomoleculeOptions: boolean;
  readonly showCrystalOptions: boolean;
};

const PICKING_MODES: readonly PickingModeValue[] = [
  PickingMode.ROTATE,
  PickingMode.IDENTIFY,
  PickingMode.DISTANCE,
  PickingMode.ANGLE,
  PickingMode.TORSION,
  PickingMode.SELECT,
  PickingMode.CENTER,
];

export type ViewerScreenViewOptions = ScreenViewOptions;

export class ViewerScreenView extends ScreenView {
  protected readonly viewerNode: MoleculeViewerNode;
  private readonly consoleNode: ScriptConsoleNode;

  public constructor(model: ViewerModel, config: ViewerScreenConfig, providedOptions: ViewerScreenViewOptions) {
    const options = optionize<ViewerScreenViewOptions, EmptySelfOptions, ScreenViewOptions>()({}, providedOptions);
    super(options);
    const layout = this.layoutBounds;
    const m = SCREEN_VIEW_MARGIN / 2;

    // Viewport between the side panels; the console runs underneath it.
    const viewLeft = layout.minX + m + LEFT_PANEL_WIDTH + GAP;
    const viewRight = layout.maxX - m - RIGHT_PANEL_WIDTH - GAP;
    const consoleTop = layout.maxY - m - CONSOLE_HEIGHT;
    const viewBounds = new Bounds2(viewLeft, layout.minY + m, viewRight, consoleTop - GAP);

    const listParent = new Node();
    const handleFile = (text: string, fileName: string) => {
      try {
        model.loadText(text, fileName);
      } catch (error) {
        model.loadErrorProperty.value = error instanceof Error ? error.message : String(error);
        model.loadStateProperty.value = "error";
      }
    };

    this.viewerNode = new MoleculeViewerNode(model, viewBounds);
    const infoPanel = new StructureInfoPanel(model, LEFT_PANEL_WIDTH, PICKING_MODES);
    infoPanel.left = layout.minX + m;
    infoPanel.top = layout.minY + m;

    const controlPanel = new ViewerControlPanel(model, listParent, {
      ...config,
      openFile: () => openFileDialog(handleFile),
      width: RIGHT_PANEL_WIDTH,
    });
    controlPanel.right = layout.maxX - m;
    controlPanel.top = layout.minY + m;

    this.consoleNode = new ScriptConsoleNode(model, new Bounds2(viewLeft, consoleTop, viewRight, layout.maxY - m));

    const resetAllButton = new ResetAllButton({
      ...FLAT_RESET_ALL_BUTTON_OPTIONS,
      listener: () => {
        model.reset();
        this.reset();
      },
      right: layout.maxX - SCREEN_VIEW_MARGIN,
      bottom: layout.maxY - SCREEN_VIEW_MARGIN,
    });

    this.children = [this.viewerNode, infoPanel, controlPanel, this.consoleNode, resetAllButton, listParent];

    // Keyboard traversal: viewer first (it is the play area), then controls, Reset All last.
    this.addChild(
      new Node({ pdomOrder: [this.viewerNode, controlPanel, infoPanel, this.consoleNode, resetAllButton] }),
    );

    installDropTarget(() => this.visible, handleFile);

    // First structure for this screen.
    model.loadEntry(model.options.defaultEntryId).catch(() => undefined);
  }

  public reset(): void {
    this.viewerNode.reset();
    this.consoleNode.reset();
  }
}
