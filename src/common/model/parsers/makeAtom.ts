/**
 * makeAtom.ts
 *
 * Shared Atom constructor for the parsers, so each one only supplies the fields its
 * format knows about.
 */

import type { ElementData } from "../Elements.js";
import type { Atom } from "../Structure.js";
import { SecondaryStructure } from "../Structure.js";

export type AtomFields = {
  readonly element: ElementData;
  readonly serial: number;
  readonly name?: string;
  readonly residueName?: string;
  readonly residueNumber?: number;
  readonly chain?: string;
  readonly hetero?: boolean;
  readonly bFactor?: number;
  readonly occupancy?: number;
  readonly formalCharge?: number;
};

export function makeAtom(fields: AtomFields): Atom {
  return {
    element: fields.element,
    serial: fields.serial,
    name: fields.name ?? `${fields.element.symbol}${fields.serial}`,
    residueName: fields.residueName ?? "",
    residueNumber: fields.residueNumber ?? 0,
    chain: fields.chain ?? "",
    hetero: fields.hetero ?? false,
    bFactor: fields.bFactor ?? 0,
    occupancy: fields.occupancy ?? 1,
    formalCharge: fields.formalCharge ?? 0,
    secondaryStructure: SecondaryStructure.NONE,
    residueIndex: -1,
  };
}

/** Thrown for malformed input; the message is a short machine-readable reason. */
export class StructureParseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "StructureParseError";
  }
}

/** A coordinate must be present and finite; Number("") must not turn missing data into zero. */
export function parseCoordinate(text: string | undefined): number {
  const value = text?.trim();
  const number = value ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) {
    throw new StructureParseError("invalidCoordinates");
  }
  return number;
}
