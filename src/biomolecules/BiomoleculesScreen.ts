/**
 * BiomoleculesScreen.ts
 *
 * The top-level Screen component. It wires together the model and view
 * factories and passes screen-level options (name, background color, tandem)
 * to the parent Screen class.
 *
 * Registered in the screens array in src/main.ts. Its home-screen and navigation-bar
 * icons come from createBiomoleculesIcon() in src/common/MolScopeScreenIcons.ts
 * (see doc/multi-screen.md).
 */
import type { TReadOnlyProperty } from "scenerystack/axon";
import { type EmptySelfOptions, optionize } from "scenerystack/phet-core";
import type { ScreenOptions } from "scenerystack/sim";
import { Screen } from "scenerystack/sim";
import type { Tandem } from "scenerystack/tandem";
import { createBiomoleculesIcon } from "../common/MolScopeScreenIcons.js";
import MolScopeColors from "../MolScopeColors.js";
import { BiomoleculesModel } from "./model/BiomoleculesModel.js";
import { BiomoleculesKeyboardHelpContent } from "./view/BiomoleculesKeyboardHelpContent.js";
import { BiomoleculesScreenView } from "./view/BiomoleculesScreenView.js";

// Require tandem to be explicit — accidental omission would break PhET-iO.
type BiomoleculesScreenOptions = ScreenOptions & { tandem: Tandem };

type BiomoleculesScreenSelfOptions = {
  /** Whether the viewer starts in perspective (Preferences → Simulation). */
  readonly perspectiveProperty: TReadOnlyProperty<boolean>;
};

export class BiomoleculesScreen extends Screen<BiomoleculesModel, BiomoleculesScreenView> {
  public constructor(selfOptions: BiomoleculesScreenSelfOptions, options: BiomoleculesScreenOptions) {
    super(
      // Model factory — called once when the screen is first shown
      () => new BiomoleculesModel(selfOptions.perspectiveProperty),
      // View factory — receives the model instance
      (model) =>
        new BiomoleculesScreenView(model, {
          tandem: options.tandem.createTandem("view"),
        }),
      optionize<BiomoleculesScreenOptions, EmptySelfOptions, ScreenOptions>()(
        {
          backgroundColorProperty: MolScopeColors.backgroundColorProperty,
          createKeyboardHelpNode: () => new BiomoleculesKeyboardHelpContent(),
          homeScreenIcon: createBiomoleculesIcon(),
          navigationBarIcon: createBiomoleculesIcon(),
        },
        options,
      ),
    );
  }
}
