/**
 * BiomoleculesScreenView.ts
 *
 * The Biomolecules screen: the shared Jmol-style viewer layout with the menus that make
 * sense for proteins and DNA from the Protein Data Bank, as cartoons, traces or atoms.
 */

import { COLOR_SCHEMES } from "../../common/model/ColorSchemes.js";
import { BIOMOLECULE_STYLES } from "../../common/model/DisplayState.js";
import { ViewerScreenView, type ViewerScreenViewOptions } from "../../common/view/ViewerScreenView.js";
import type { BiomoleculesModel } from "../model/BiomoleculesModel.js";
import { BiomoleculesScreenSummaryContent } from "./BiomoleculesScreenSummaryContent.js";

export class BiomoleculesScreenView extends ViewerScreenView {
  public constructor(model: BiomoleculesModel, providedOptions?: ViewerScreenViewOptions) {
    super(
      model,
      {
        styles: BIOMOLECULE_STYLES,
        colorSchemes: [...COLOR_SCHEMES],
        showBiomoleculeOptions: true,
        showCrystalOptions: false,
      },
      { screenSummaryContent: new BiomoleculesScreenSummaryContent(model), ...providedOptions },
    );
  }
}
