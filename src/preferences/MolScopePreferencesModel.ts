/**
 * MolScopePreferencesModel.ts
 *
 * Model for the simulation-specific preferences shown in Preferences →
 * Simulation. Each preference Property takes its initial value from the
 * corresponding query parameter in molScopeQueryParameters.

 */

import { BooleanProperty } from "scenerystack/axon";
import type { Tandem } from "scenerystack/tandem";
import MolScopeNamespace from "../MolScopeNamespace.js";
import molScopeQueryParameters from "./molScopeQueryParameters.js";

export class MolScopePreferencesModel {
  /** Perspective (true) or orthographic (false) projection; from the `perspective` query parameter. */
  public readonly perspectiveProperty: BooleanProperty;

  public constructor(tandem?: Tandem) {
    this.perspectiveProperty = new BooleanProperty(
      molScopeQueryParameters.perspective,
      tandem ? { tandem: tandem.createTandem("perspectiveProperty") } : undefined,
    );
  }

  public reset(): void {
    this.perspectiveProperty.reset();
  }
}

MolScopeNamespace.register("MolScopePreferencesModel", MolScopePreferencesModel);
