/**
 * CrystalsScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createCrystalsIcon() in src/common/MolScopeScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import type { TReadOnlyProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createCrystalsIcon } from "../common/MolScopeScreenIcons.js";
import MolScopeColors from "../MolScopeColors.js";
import { CrystalsModel } from "./model/CrystalsModel.js";
import { CrystalsKeyboardHelpContent } from "./view/CrystalsKeyboardHelpContent.js";
import { CrystalsScreenView } from "./view/CrystalsScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type CrystalsScreenOptions = ScreenOptions & { tandem: Tandem };

type CrystalsScreenSelfOptions = {
  /** Whether the viewer starts in perspective (Preferences → Simulation). */
  readonly perspectiveProperty: TReadOnlyProperty<boolean>;
};

export class CrystalsScreen extends Screen<CrystalsModel, CrystalsScreenView> {
  public constructor(selfOptions: CrystalsScreenSelfOptions, options: CrystalsScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new CrystalsModel(selfOptions.perspectiveProperty),
      // View factory — receives the model instance
      (model) =>
        new CrystalsScreenView(model, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<CrystalsScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: MolScopeColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new CrystalsKeyboardHelpContent(),
          homeScreenIcon: createCrystalsIcon(),
          navigationBarIcon: createCrystalsIcon(),
        },
        options,
      ),
    );
  }
}
