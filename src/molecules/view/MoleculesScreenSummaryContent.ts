/**
 * MoleculesScreenSummaryContent.ts
 *
 * The accessible screen summary for the Molecules screen. The current-details paragraph is
 * live: it names the loaded structure, its atom count, the rendering style and the
 * colour scheme, and updates whenever any of them change.
 */

import { ScreenSummaryContent } from "scenerystack/sim";
import { createCurrentDetailsProperty } from "../../common/view/createCurrentDetailsProperty.js";
import { StringManager } from "../../i18n/StringManager.js";
import type { MoleculesModel } from "../model/MoleculesModel.js";

export class MoleculesScreenSummaryContent extends ScreenSummaryContent {
  public constructor(model: MoleculesModel) {
    const a11y = StringManager.getInstance().getMoleculesA11yStrings();

    // The screen lives for the whole sim, so the details Property is never disposed.
    super({
      playAreaContent: a11y.screenSummary.playAreaStringProperty,
      controlAreaContent: a11y.screenSummary.controlAreaStringProperty,
      currentDetailsContent: createCurrentDetailsProperty(model),
      interactionHintContent: a11y.screenSummary.interactionHintStringProperty,
    });
  }
}
