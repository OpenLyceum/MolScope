import type { Atom, Bond } from "../Structure.js";

/** Frames share atom indexing, identities, charges and (when explicit) the same bond graph. */
export function framesCompatible(
  atoms: readonly Atom[],
  nextAtoms: readonly Atom[],
  bonds: readonly Bond[] = [],
  nextBonds: readonly Bond[] = [],
): boolean {
  if (
    atoms.length !== nextAtoms.length ||
    !atoms.every(
      (atom, i) =>
        atom.element.number === nextAtoms[i]?.element.number && atom.formalCharge === nextAtoms[i]?.formalCharge,
    )
  ) {
    return false;
  }
  const bondKeys = (entries: readonly Bond[]) =>
    entries
      .map(({ a, b, order }) => `${Math.min(a, b)}:${Math.max(a, b)}:${order}`)
      .sort()
      .join(",");
  return bondKeys(bonds) === bondKeys(nextBonds);
}
