/**
 * MoleculesModel.ts
 *
 * Model for the Molecules screen: a {@link ViewerModel} over small molecules from PubChem, idealised VSEPR shapes, and animated vibrations and torsions.
 * Everything the screen does — loading, styles, picking, measurement, scripting —
 * lives in the shared viewer model; this class only chooses the library and the
 * default rendering.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { ColorScheme } from "../../common/model/ColorSchemes.js";
import { DisplayStyle } from "../../common/model/DisplayState.js";
import { LibraryCategory } from "../../common/model/library/StructureLibrary.js";
import { ViewerModel } from "../../common/model/ViewerModel.js";

export class MoleculesModel extends ViewerModel {
  public constructor(perspectivePreferenceProperty: TReadOnlyProperty<boolean>) {
    super({
      category: LibraryCategory.MOLECULES,
      defaultEntryId: "caffeine",
      defaultStyle: DisplayStyle.BALL_AND_STICK,
      defaultColorScheme: ColorScheme.ELEMENT,
      showUnitCellOnLoad: false,
      perspectivePreferenceProperty,
    });
  }
}
