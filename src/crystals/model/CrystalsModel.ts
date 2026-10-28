/**
 * CrystalsModel.ts
 *
 * Model for the Crystals screen: a {@link ViewerModel} over inorganic crystals from the Crystallography Open Database, packed into unit cells.
 * Everything the screen does — loading, styles, picking, measurement, scripting —
 * lives in the shared viewer model; this class only chooses the library and the
 * default rendering.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { ColorScheme } from "../../common/model/ColorSchemes.js";
import { DisplayStyle } from "../../common/model/DisplayState.js";
import { LibraryCategory } from "../../common/model/library/StructureLibrary.js";
import { ViewerModel } from "../../common/model/ViewerModel.js";

export class CrystalsModel extends ViewerModel {
  public constructor(perspectivePreferenceProperty: TReadOnlyProperty<boolean>) {
    super({
      category: LibraryCategory.CRYSTALS,
      defaultEntryId: "sodium-chloride",
      defaultStyle: DisplayStyle.BALL_AND_STICK,
      defaultColorScheme: ColorScheme.ELEMENT,
      showUnitCellOnLoad: true,
      perspectivePreferenceProperty,
    });
  }
}
