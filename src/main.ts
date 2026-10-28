/**
 * main.ts
 *
 * Entry point for the simulation. Initializes SceneryStack, creates the
 * screens, and starts the main event loop.
 *
 * !! CRITICAL IMPORT ORDER !!
 * brand.js MUST be the first import. Each module imports the next, so the import nesting is
 *
 *   main → brand → splash → assert → init
 *
 * and therefore the actual EXECUTION order (deepest import runs first) is the reverse:
 *
 *   init → assert → splash → brand → main
 *
 * SceneryStack requires this exact load order. Never reorder these imports.
 */

// brand.js MUST be first; importing it runs the whole chain (init→assert→splash→brand) before main.
import "./brand.js";

import { onReadyToLaunch, PreferencesModel, Sim } from "scenerystack/sim";
import { Tandem } from "scenerystack/tandem";
import { BiomoleculesScreen } from "./biomolecules/BiomoleculesScreen.js";
import { CrystalsScreen } from "./crystals/CrystalsScreen.js";
import { StringManager } from "./i18n/StringManager.js";
import MolScopeColors from "./MolScopeColors.js";
import { MoleculesScreen } from "./molecules/MoleculesScreen.js";
import { MolScopePreferencesModel } from "./preferences/MolScopePreferencesModel.js";
import { MolScopePreferencesNode } from "./preferences/MolScopePreferencesNode.js";

onReadyToLaunch(() => {
  const stringManager = StringManager.getInstance();

  // Simulation-specific preferences; initial values come from molScopeQueryParameters.
  const simPreferences = new MolScopePreferencesModel(Tandem.ROOT.createTandem("preferences"));

  const screens = [
    new MoleculesScreen(
      { perspectiveProperty: simPreferences.perspectiveProperty },
      {
        name: stringManager.getScreenNames().moleculesStringProperty,
        tandem: Tandem.ROOT.createTandem("moleculesScreen"),
        backgroundColorProperty: MolScopeColors.backgroundColorProperty,
      },
    ),
    new BiomoleculesScreen(
      { perspectiveProperty: simPreferences.perspectiveProperty },
      {
        name: stringManager.getScreenNames().biomoleculesStringProperty,
        tandem: Tandem.ROOT.createTandem("biomoleculesScreen"),
        backgroundColorProperty: MolScopeColors.backgroundColorProperty,
      },
    ),
    new CrystalsScreen(
      { perspectiveProperty: simPreferences.perspectiveProperty },
      {
        name: stringManager.getScreenNames().crystalsStringProperty,
        tandem: Tandem.ROOT.createTandem("crystalsScreen"),
        backgroundColorProperty: MolScopeColors.backgroundColorProperty,
      },
    ),
  ];

  const sim = new Sim(stringManager.getTitleStringProperty(), screens, {
    preferencesModel: new PreferencesModel({
      visualOptions: {
        // Adds a "Projector Mode" toggle in Preferences → Visual
        supportsProjectorMode: true,
        // Enables keyboard-navigation highlight outlines
        supportsInteractiveHighlights: true,
      },
      simulationOptions: {
        customPreferences: [
          {
            createContent: (tandem: Tandem) => new MolScopePreferencesNode(simPreferences, tandem),
          },
        ],
      },
      localizationOptions: {
        // Adds a language picker in Preferences → Language
        supportsDynamicLocale: true,
      },
    }),

    // Optional: fill in credits shown in Help → About
    credits: {
      leadDesign: "Martin Veillette",
      softwareDevelopment: "Martin Veillette",
      team: "Inspired by Jmol, the open-source Java viewer for chemical structures in 3D (jmol.sourceforge.net)",
      qualityAssurance: "",
      thanks:
        "Structures: PubChem (NIH NCBI), RCSB Protein Data Bank, Crystallography Open Database — all public domain.",
    },
  });

  sim.start();
});
