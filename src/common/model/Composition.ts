/**
 * Composition.ts
 *
 * Molecular formula (Hill order: C, then H, then the rest alphabetically) and molar
 * mass for the info panel. For crystals the packed cell repeats atoms on faces, so
 * the caller passes the asymmetric formula from the file instead.
 */

import type { Structure } from "./Structure.js";

export type FormulaTerm = { readonly symbol: string; readonly count: number };

export function hillFormula(structure: Structure): FormulaTerm[] {
  const counts = new Map<string, number>();
  for (const atom of structure.atoms) {
    counts.set(atom.element.symbol, (counts.get(atom.element.symbol) ?? 0) + 1);
  }
  const symbols = [...counts.keys()];
  const hasCarbon = counts.has("C");
  symbols.sort((a, b) => {
    if (hasCarbon) {
      const rank = (s: string) => (s === "C" ? 0 : s === "H" ? 1 : 2);
      const d = rank(a) - rank(b);
      if (d !== 0) {
        return d;
      }
    }
    return a.localeCompare(b);
  });
  return symbols.map((symbol) => ({ symbol, count: counts.get(symbol) ?? 0 }));
}

/** "C8H10N4O2" with plain digits (the view renders subscripts). */
export function formulaString(terms: readonly FormulaTerm[]): string {
  return terms.map((t) => (t.count === 1 ? t.symbol : `${t.symbol}${t.count}`)).join("");
}

/** Sum of standard atomic weights, g/mol. */
export function molarMass(structure: Structure): number {
  let mass = 0;
  for (const atom of structure.atoms) {
    mass += atom.element.mass;
  }
  return mass;
}
