/**
 * BiomoleculesModel.ts
 *
 * Model for the Biomolecules screen: a {@link ViewerModel} over proteins and DNA from the Protein Data Bank, as cartoons, traces or atoms.
 * Everything the screen does — loading, styles, picking, measurement, scripting —
 * lives in the shared viewer model; this class only chooses the library and the
 * default rendering.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { ColorScheme } from "../../common/model/ColorSchemes.js";
import { DisplayStyle } from "../../common/model/DisplayState.js";
import { LibraryCategory } from "../../common/model/library/StructureLibrary.js";
import { ViewerModel } from "../../common/model/ViewerModel.js";

export class BiomoleculesModel extends ViewerModel {
  public constructor(perspectivePreferenceProperty: TReadOnlyProperty<boolean>) {
    super({
      category: LibraryCategory.BIOMOLECULES,
      defaultEntryId: "1crn",
      defaultStyle: DisplayStyle.CARTOON,
      defaultColorScheme: ColorScheme.STRUCTURE,
      showUnitCellOnLoad: false,
      perspectivePreferenceProperty,
    });
  }
}
