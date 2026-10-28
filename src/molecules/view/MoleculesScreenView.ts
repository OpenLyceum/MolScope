/**
 * MoleculesScreenView.ts
 *
 * The Molecules screen: the shared Jmol-style viewer layout with the menus that make
 * sense for small molecules from PubChem, idealised VSEPR shapes, and animated vibrations and torsions.
 */

import { ColorScheme } from "../../common/model/ColorSchemes.js";
import { SMALL_MOLECULE_STYLES } from "../../common/model/DisplayState.js";
import { ViewerScreenView, type ViewerScreenViewOptions } from "../../common/view/ViewerScreenView.js";
import type { MoleculesModel } from "../model/MoleculesModel.js";
import { MoleculesScreenSummaryContent } from "./MoleculesScreenSummaryContent.js";

export class MoleculesScreenView extends ViewerScreenView {
  public constructor(model: MoleculesModel, providedOptions?: ViewerScreenViewOptions) {
    super(
      model,
      {
        styles: SMALL_MOLECULE_STYLES,
        colorSchemes: [ColorScheme.ELEMENT, ColorScheme.CHARGE],
        showBiomoleculeOptions: false,
        showCrystalOptions: false,
      },
      { screenSummaryContent: new MoleculesScreenSummaryContent(model), ...providedOptions },
    );
  }
}
