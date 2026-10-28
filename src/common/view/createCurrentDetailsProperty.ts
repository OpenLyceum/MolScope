/**
 * createCurrentDetailsProperty.ts
 *
 * The live "current details" paragraph shared by every screen summary:
 * "Caffeine: 24 atoms, Ball & Stick style, colored by Element (CPK)."
 */

import { DerivedProperty, type Property, type TReadOnlyProperty } from "scenerystack/axon";
import { StringUtils } from "scenerystack/phetcommon";
import { StringManager } from "../../i18n/StringManager.js";
import type { ViewerModel } from "../model/ViewerModel.js";
import { structureDisplayName } from "./formatters.js";

export function createCurrentDetailsProperty(model: ViewerModel): TReadOnlyProperty<string> {
  const strings = StringManager.getInstance();
  const a11y = strings.getCommonA11yStrings();
  const styles = strings.getStyles() as unknown as Record<string, Property<string>>;
  const schemes = strings.getColorSchemes() as unknown as Record<string, Property<string>>;
  return DerivedProperty.deriveAny(
    [
      model.structureProperty,
      model.entryIdProperty,
      model.styleProperty,
      model.colorSchemeProperty,
      a11y.detailsStringProperty,
      a11y.detailsNoneStringProperty,
    ],
    () => {
      const structure = model.structureProperty.value;
      if (!structure) {
        return a11y.detailsNoneStringProperty.value;
      }
      return StringUtils.fillIn(a11y.detailsStringProperty.value, {
        title: structureDisplayName(model),
        atoms: structure.atoms.length,
        style: styles[`${model.styleProperty.value}StringProperty`]?.value ?? model.styleProperty.value,
        scheme: schemes[`${model.colorSchemeProperty.value}StringProperty`]?.value ?? model.colorSchemeProperty.value,
      });
    },
  );
}
