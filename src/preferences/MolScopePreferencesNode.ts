/**
 * MolScopePreferencesNode.ts
 *
 * Custom preferences UI shown in Preferences → Simulation. Controls are bound
 * to MolScopePreferencesModel Properties (whose initial values come from
 * molScopeQueryParameters).
 */

import { Text, VBox } from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { Checkbox } from "scenerystack/sun";
import type { Tandem } from "scenerystack/tandem";
import { StringManager } from "../i18n/StringManager.js";
import MolScopeColors from "../MolScopeColors.js";
import MolScopeNamespace from "../MolScopeNamespace.js";
import type { MolScopePreferencesModel } from "./MolScopePreferencesModel.js";

export class MolScopePreferencesNode extends VBox {
  public constructor(preferencesModel: MolScopePreferencesModel, tandem?: Tandem) {
    const prefStrings = StringManager.getInstance().getPreferences();

    // The Preferences dialog is always white, so use the dark "light control surface"
    // colors (readable on white in both default and projector profiles), not textColorProperty
    // (which is near-white in default mode and would be invisible on the white dialog).
    const header = new Text(prefStrings.titleStringProperty, {
      font: new PhetFont({ size: 18, weight: "bold" }),
      fill: MolScopeColors.controlSurfaceTextColorProperty,
    });

    const perspectiveCheckbox = new Checkbox(
      preferencesModel.perspectiveProperty,
      new Text(prefStrings.perspectiveStringProperty, {
        font: new PhetFont(14),
        fill: MolScopeColors.controlSurfaceTextColorProperty,
      }),
      {
        checkboxColor: MolScopeColors.controlSurfaceTextColorProperty,
        checkboxColorBackground: MolScopeColors.controlSurfaceColorProperty,
        spacing: 8,
        ...(tandem && { tandem: tandem.createTandem("perspectiveCheckbox") }),
      },
    );

    super({
      align: "left",
      spacing: 12,
      children: [header, perspectiveCheckbox],
    });
  }
}

MolScopeNamespace.register("MolScopePreferencesNode", MolScopePreferencesNode);
