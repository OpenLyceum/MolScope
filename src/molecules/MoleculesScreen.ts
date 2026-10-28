/**
 * MoleculesScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createMoleculesIcon() in src/common/MolScopeScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import type { TReadOnlyProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createMoleculesIcon } from "../common/MolScopeScreenIcons.js";
import MolScopeColors from "../MolScopeColors.js";
import { MoleculesModel } from "./model/MoleculesModel.js";
import { MoleculesKeyboardHelpContent } from "./view/MoleculesKeyboardHelpContent.js";
import { MoleculesScreenView } from "./view/MoleculesScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type MoleculesScreenOptions = ScreenOptions & { tandem: Tandem };

type MoleculesScreenSelfOptions = {
  /** Whether the viewer starts in perspective (Preferences → Simulation). */
  readonly perspectiveProperty: TReadOnlyProperty<boolean>;
};

export class MoleculesScreen extends Screen<MoleculesModel, MoleculesScreenView> {
  public constructor(selfOptions: MoleculesScreenSelfOptions, options: MoleculesScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new MoleculesModel(selfOptions.perspectiveProperty),
      // View factory — receives the model instance
      (model) =>
        new MoleculesScreenView(model, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<MoleculesScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: MolScopeColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new MoleculesKeyboardHelpContent(),
          homeScreenIcon: createMoleculesIcon(),
          navigationBarIcon: createMoleculesIcon(),
        },
        options,
      ),
    );
  }
}
