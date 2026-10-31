import { StructureParseError } from "./parsers/makeAtom.js";
import type { Frame } from "./Structure.js";

/** Reject malformed coordinates before bonding, display state or camera state can be changed. */
export function validateFrames(atomCount: number, frames: readonly Frame[]): void {
  if (
    atomCount <= 0 ||
    frames.length === 0 ||
    frames.some(
      (frame) =>
        frame.positions.length !== atomCount * 3 ||
        !frame.positions.every(Number.isFinite) ||
        (frame.vibrations !== null &&
          (frame.vibrations.length !== atomCount * 3 || !frame.vibrations.every(Number.isFinite))),
    )
  ) {
    throw new StructureParseError("invalidCoordinates");
  }
}
