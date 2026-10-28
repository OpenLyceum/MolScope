/**
 * MolScopePanel.ts
 *
 * A pre-themed Panel that automatically uses MolScopeColors for background and
 * border. Use this for all control panels and info boxes in the sim so that
 * default / projector mode switching is handled automatically.
 *
 * ── Basic usage ───────────────────────────────────────────────────────────────
 *
 *   import { MolScopePanel } from "../../common/MolScopePanel.js";
 *   import { VBox, Text } from "scenerystack/scenery";
 *
 *   const content = new VBox({
 *     children: [ new Text("label"), slider ],
 *     spacing: 8,
 *   });
 *   const panel = new MolScopePanel(content);
 *
 * ── Overriding defaults ───────────────────────────────────────────────────────
 *
 *   // Wider margins, sharper corners, custom stroke
 *   const panel = new MolScopePanel(content, { xMargin: 20, cornerRadius: 0 });
 *
 *   // Transparent background (decorative border only)
 *   const panel = new MolScopePanel(content, { fill: "transparent" });
 */

import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { Node } from "scenerystack/scenery";
import { Panel, type PanelOptions } from "scenerystack/sun";
import MolScopeColors from "../MolScopeColors.js";
import { PANEL_CORNER_RADIUS } from "../MolScopeConstants.js";

export type MolScopePanelOptions = PanelOptions;

export class MolScopePanel extends Panel {
  public constructor(content: Node, providedOptions?: MolScopePanelOptions) {
    const options = optionize<MolScopePanelOptions, EmptySelfOptions, PanelOptions>()(
      {
        fill: MolScopeColors.panelBackgroundColorProperty,
        stroke: MolScopeColors.panelBorderColorProperty,
        cornerRadius: PANEL_CORNER_RADIUS,
        xMargin: 12,
        yMargin: 10,
      },
      providedOptions,
    );
    super(content, options);
  }
}
