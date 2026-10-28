/**
 * CrystalsScreenView.ts
 *
 * The Crystals screen: the shared Jmol-style viewer layout with the menus that make
 * sense for inorganic crystals from the Crystallography Open Database, packed into unit cells.
 */

import { ColorScheme } from "../../common/model/ColorSchemes.js";
import { SMALL_MOLECULE_STYLES } from "../../common/model/DisplayState.js";
import { ViewerScreenView, type ViewerScreenViewOptions } from "../../common/view/ViewerScreenView.js";
import type { CrystalsModel } from "../model/CrystalsModel.js";
import { CrystalsScreenSummaryContent } from "./CrystalsScreenSummaryContent.js";

export class CrystalsScreenView extends ViewerScreenView {
  public constructor(model: CrystalsModel, providedOptions?: ViewerScreenViewOptions) {
    super(
      model,
      {
        styles: SMALL_MOLECULE_STYLES,
        colorSchemes: [ColorScheme.ELEMENT],
        showBiomoleculeOptions: false,
        showCrystalOptions: true,
      },
      { screenSummaryContent: new CrystalsScreenSummaryContent(model), ...providedOptions },
    );
  }
}
