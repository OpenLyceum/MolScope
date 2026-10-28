/**
 * formatters.ts
 *
 * Localised text for atoms and measurements, shared by the tooltip, the info panel,
 * the console and the accessible descriptions.
 */

import type { TReadOnlyProperty } from "scenerystack/axon";
import { toFixed } from "scenerystack/dot";
import { StringUtils } from "scenerystack/phetcommon";
import { StringManager } from "../../i18n/StringManager.js";
import { libraryEntry } from "../model/library/StructureLibrary.js";
import type { ScriptMessage } from "../model/ScriptEngine.js";
import type { Structure } from "../model/Structure.js";
import type { ViewerModel } from "../model/ViewerModel.js";

/** Maximum characters of a file-supplied title shown in panels. */
const MAX_TITLE_LENGTH = 90;

/** The localised library name when the structure came from the library, else the file's own title. */
export function structureDisplayName(model: ViewerModel): string {
  const entry = libraryEntry(model.entryIdProperty.value);
  const names = StringManager.getInstance().getLibraryNames() as unknown as Record<string, TReadOnlyProperty<string>>;
  const name = entry ? names[`${entry.nameKey}StringProperty`]?.value : undefined;
  const title = name ?? model.structure?.title ?? "";
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title;
}

/** "CA · C #12" plus "ALA 3 chain A" for biomolecules. */
export function formatAtomDescription(structure: Structure, index: number): string {
  const info = StringManager.getInstance().getInfo();
  const atom = structure.atoms[index];
  if (!atom) {
    return "";
  }
  const parts = [
    StringUtils.fillIn(info.atomStringProperty.value, {
      name: atom.name,
      element: atom.element.symbol,
      serial: atom.serial,
    }),
  ];
  if (atom.residueName) {
    parts.push(
      StringUtils.fillIn(info.residueStringProperty.value, {
        residue: atom.residueName,
        number: atom.residueNumber,
        chain: atom.chain || "–",
      }),
    );
  }
  return parts.join(" · ");
}

/** Cartesian position of an atom, "(x, y, z) Å". */
export function formatPosition(positions: Float64Array, index: number): string {
  return StringUtils.fillIn(StringManager.getInstance().getInfo().positionStringProperty.value, {
    x: toFixed(positions[3 * index] ?? 0, 3),
    y: toFixed(positions[3 * index + 1] ?? 0, 3),
    z: toFixed(positions[3 * index + 2] ?? 0, 3),
  });
}

/** "1.54 Å" for distances, "109.5°" for angles and torsions. */
export function formatMeasurement(atomCount: number, value: number): string {
  const units = StringManager.getInstance().getUnits();
  return atomCount === 2
    ? StringUtils.fillIn(units.angstromsStringProperty.value, { value: toFixed(value, 3) })
    : StringUtils.fillIn(units.degreesStringProperty.value, { value: toFixed(value, 1) });
}

/** Localised console text for a script message. */
export function formatScriptMessage(message: ScriptMessage): string {
  const patterns = StringManager.getInstance().getScriptMessages();
  const pattern = patterns[`${message.key}StringProperty`].value;
  const args: Record<string, string | number> = { ...message.args };
  if (message.key === "measured" && typeof args["value"] === "number") {
    args["value"] = formatMeasurement(Number(args["count"] ?? 2), args["value"]);
  }
  return StringUtils.fillIn(pattern, args);
}
