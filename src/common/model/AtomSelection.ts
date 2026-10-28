/**
 * AtomSelection.ts
 *
 * A compiler for (a practical subset of) Jmol's atom-expression language, used by
 * the script console's `select`, `restrict`, `display`, `hide`, `center` and
 * `measure` commands. Supported forms:
 *
 *   all  none  *  selected  displayed  protein  nucleic  dna  rna  water  solvent
 *   hetero  ligand  backbone  sidechain  helix  sheet  polymer  carbon  hydrogen  … (element names)
 *   _C  _Fe                  element symbol
 *   ALA  [HEM]  [ALA]25:A.CA residue name / number / chain / atom name, Jmol "atom spec"
 *   25  10-20  :A  .CA  *.N  residue numbers, chain, atom name
 *   atomno=5  resno>=10  elemno=6  temperature>30  occupancy<1  x<0  formalCharge<0
 *   element=C  chain=A  group=ALA  atomname=CA
 *   within(5.0, ligand)      atoms within 5 Å of another set
 *   not / !   and / &   or / | / ,   ( … )
 *
 * The result is a Uint8Array mask over the structure's atoms.
 */

import { elementForName, elementForSymbol, UNKNOWN_ELEMENT } from "./Elements.js";
import type { Atom, Frame, Structure } from "./Structure.js";
import { ResidueKind, SecondaryStructure } from "./Structure.js";
import { AMINO_ACIDS, NUCLEOTIDES } from "./StructureBuilder.js";

export class SelectionSyntaxError extends Error {
  public readonly token: string;

  public constructor(token: string) {
    super(`Unrecognised selection token: ${token}`);
    this.name = "SelectionSyntaxError";
    this.token = token;
  }
}

export type SelectionContext = {
  readonly structure: Structure;
  readonly frame: Frame;
  /** The current selection, for the `selected` keyword. */
  readonly selected: Uint8Array;
  /** Whether atom i is currently shown, for `displayed`. */
  readonly isDisplayed: (index: number) => boolean;
};

type Predicate = (index: number) => boolean;

const BACKBONE_NAMES = new Set([
  "N",
  "CA",
  "C",
  "O",
  "OXT",
  "P",
  "OP1",
  "OP2",
  "O1P",
  "O2P",
  "O5'",
  "C5'",
  "C4'",
  "C3'",
  "O3'",
]);

const COMPARISON_OPERATORS = ["<=", ">=", "!=", "==", "=", "<", ">"];

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const re = /\s*(<=|>=|!=|==|[=<>(),!&|]|"[^"]*"|'[^']*'|[^\s=<>(),!&|]+)/g;
  let match = re.exec(text);
  while (match !== null) {
    if (match[1]) {
      tokens.push(match[1]);
    }
    match = re.exec(text);
  }
  return tokens;
}

/** Compiles and evaluates a selection expression into a mask. Throws {@link SelectionSyntaxError}. */
export function evaluateSelection(expression: string, context: SelectionContext): Uint8Array {
  const n = context.structure.atoms.length;
  const mask = new Uint8Array(n);
  const trimmed = expression.trim();
  if (trimmed === "") {
    mask.fill(1);
    return mask;
  }
  const predicate = new SelectionParser(tokenize(trimmed), context).parse();
  for (let i = 0; i < n; i++) {
    mask[i] = predicate(i) ? 1 : 0;
  }
  return mask;
}

class SelectionParser {
  private position = 0;
  private readonly tokens: string[];
  private readonly context: SelectionContext;
  private readonly atoms: readonly Atom[];

  public constructor(tokens: string[], context: SelectionContext) {
    this.tokens = tokens;
    this.context = context;
    this.atoms = context.structure.atoms;
  }

  public parse(): Predicate {
    const predicate = this.parseOr();
    if (this.position < this.tokens.length) {
      throw new SelectionSyntaxError(this.tokens[this.position] ?? "");
    }
    return predicate;
  }

  private peek(): string {
    return (this.tokens[this.position] ?? "").toLowerCase();
  }

  private next(): string {
    const token = this.tokens[this.position] ?? "";
    this.position++;
    return token;
  }

  private expect(token: string): void {
    if (this.peek() !== token) {
      throw new SelectionSyntaxError(this.tokens[this.position] ?? token);
    }
    this.position++;
  }

  private parseOr(): Predicate {
    let left = this.parseAnd();
    while (["or", "|", ","].includes(this.peek())) {
      this.position++;
      const a = left;
      const b = this.parseAnd();
      left = (i) => a(i) || b(i);
    }
    return left;
  }

  private parseAnd(): Predicate {
    let left = this.parseNot();
    while (["and", "&"].includes(this.peek())) {
      this.position++;
      const a = left;
      const b = this.parseNot();
      left = (i) => a(i) && b(i);
    }
    return left;
  }

  private parseNot(): Predicate {
    if (["not", "!"].includes(this.peek())) {
      this.position++;
      const inner = this.parseNot();
      return (i) => !inner(i);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Predicate {
    const token = this.peek();
    if (token === "") {
      throw new SelectionSyntaxError("");
    }
    if (token === "(") {
      this.position++;
      const inner = this.parseOr();
      this.expect(")");
      return inner;
    }
    if (token === "within") {
      return this.parseWithin();
    }
    const following = (this.tokens[this.position + 1] ?? "").toLowerCase();
    if (COMPARISON_OPERATORS.includes(following)) {
      return this.parseComparison();
    }
    this.position++;
    return this.keyword(token) ?? this.atomSpec(this.tokens[this.position - 1] ?? token);
  }

  private parseWithin(): Predicate {
    this.position++;
    this.expect("(");
    const radius = Number(this.next());
    if (!Number.isFinite(radius)) {
      throw new SelectionSyntaxError("within");
    }
    this.expect(",");
    const inner = this.parseOr();
    this.expect(")");
    const positions = this.context.frame.positions;
    const centers: number[] = [];
    for (let i = 0; i < this.atoms.length; i++) {
      if (inner(i)) {
        centers.push(i);
      }
    }
    const r2 = radius * radius;
    return (i) => {
      const x = positions[3 * i] ?? 0;
      const y = positions[3 * i + 1] ?? 0;
      const z = positions[3 * i + 2] ?? 0;
      for (const c of centers) {
        const dx = (positions[3 * c] ?? 0) - x;
        const dy = (positions[3 * c + 1] ?? 0) - y;
        const dz = (positions[3 * c + 2] ?? 0) - z;
        if (dx * dx + dy * dy + dz * dz <= r2) {
          return true;
        }
      }
      return false;
    };
  }

  private parseComparison(): Predicate {
    const property = this.next().toLowerCase();
    const op = this.next();
    const rawValue = this.next().replace(/^["']|["']$/g, "");
    const atoms = this.atoms;
    const positions = this.context.frame.positions;

    const stringProperty: Record<string, (a: Atom) => string> = {
      element: (a) => a.element.symbol.toLowerCase(),
      chain: (a) => a.chain.toLowerCase(),
      group: (a) => a.residueName.toLowerCase(),
      resname: (a) => a.residueName.toLowerCase(),
      atomname: (a) => a.name.toLowerCase(),
      name: (a) => a.name.toLowerCase(),
    };
    const stringGetter = stringProperty[property];
    if (stringGetter) {
      const value = rawValue.toLowerCase();
      const equal = op === "=" || op === "==";
      if (!equal && op !== "!=") {
        throw new SelectionSyntaxError(op);
      }
      return (i) => {
        const atom = atoms[i];
        return atom ? (stringGetter(atom) === value) === equal : false;
      };
    }

    const numericProperty: Record<string, (a: Atom, i: number) => number> = {
      atomno: (a) => a.serial,
      atomindex: (_a, i) => i,
      resno: (a) => a.residueNumber,
      elemno: (a) => a.element.number,
      temperature: (a) => a.bFactor,
      occupancy: (a) => a.occupancy,
      formalcharge: (a) => a.formalCharge,
      x: (_a, i) => positions[3 * i] ?? 0,
      y: (_a, i) => positions[3 * i + 1] ?? 0,
      z: (_a, i) => positions[3 * i + 2] ?? 0,
    };
    const getter = numericProperty[property];
    const value = Number(rawValue);
    if (!(getter && Number.isFinite(value))) {
      throw new SelectionSyntaxError(property);
    }
    const compare: Record<string, (v: number) => boolean> = {
      "=": (v) => v === value,
      "==": (v) => v === value,
      "!=": (v) => v !== value,
      "<": (v) => v < value,
      "<=": (v) => v <= value,
      ">": (v) => v > value,
      ">=": (v) => v >= value,
    };
    const test = compare[op];
    if (!test) {
      throw new SelectionSyntaxError(op);
    }
    return (i) => {
      const atom = atoms[i];
      return atom ? test(getter(atom, i)) : false;
    };
  }

  /** Named sets; null if `token` is not a keyword. */
  private keyword(token: string): Predicate | null {
    const { structure, selected, isDisplayed } = this.context;
    const atoms = this.atoms;
    const residueOf = (i: number) => structure.residues[atoms[i]?.residueIndex ?? -1];
    const kindIs = (kind: number) => (i: number) => residueOf(i)?.kind === kind;
    const isNucleic = kindIs(ResidueKind.NUCLEIC);
    switch (token) {
      case "all":
      case "*":
        return () => true;
      case "none":
        return () => false;
      case "selected":
        return (i) => selected[i] === 1;
      case "displayed":
      case "visible":
        return isDisplayed;
      case "protein":
      case "amino":
        return kindIs(ResidueKind.AMINO);
      case "nucleic":
        return isNucleic;
      case "dna":
        return (i) => isNucleic(i) && (residueOf(i)?.name.toUpperCase().startsWith("D") ?? false);
      case "rna":
        return (i) => isNucleic(i) && !(residueOf(i)?.name.toUpperCase().startsWith("D") ?? true);
      case "polymer":
        return (i) => isNucleic(i) || kindIs(ResidueKind.AMINO)(i);
      case "water":
      case "solvent":
        return kindIs(ResidueKind.WATER);
      case "hetero":
        return (i) => atoms[i]?.hetero === true;
      case "ligand":
        return (i) => {
          const kind = residueOf(i)?.kind;
          return atoms[i]?.hetero === true && kind !== ResidueKind.WATER && kind !== ResidueKind.AMINO;
        };
      case "backbone":
      case "mainchain":
        return (i) => {
          const kind = residueOf(i)?.kind;
          return (
            (kind === ResidueKind.AMINO || kind === ResidueKind.NUCLEIC) && BACKBONE_NAMES.has(atoms[i]?.name ?? "")
          );
        };
      case "sidechain":
        return (i) => kindIs(ResidueKind.AMINO)(i) && !BACKBONE_NAMES.has(atoms[i]?.name ?? "");
      case "helix":
        return (i) => atoms[i]?.secondaryStructure === SecondaryStructure.HELIX;
      case "sheet":
        return (i) => atoms[i]?.secondaryStructure === SecondaryStructure.SHEET;
      default:
        break;
    }
    const named = elementForName(token);
    if (named) {
      return (i) => atoms[i]?.element === named;
    }
    if (token.startsWith("_") && token.length > 1) {
      const element = elementForSymbol(token.slice(1));
      if (element !== UNKNOWN_ELEMENT) {
        return (i) => atoms[i]?.element === element;
      }
    }
    return null;
  }

  /** Jmol atom spec: [RES]num-num:chain.name, any part optional. */
  private atomSpec(token: string): Predicate {
    const re =
      /^(?:\[([A-Za-z0-9]+)\]|([A-Za-z][A-Za-z0-9]{0,2})|\*)?(?:(-?\d+)(?:-(-?\d+))?)?(?::([A-Za-z0-9*]))?(?:\.([A-Za-z0-9'*]+))?$/;
    const match = re.exec(token);
    const knownResidueNames = new Set(this.context.structure.residues.map((r) => r.name.toUpperCase()));
    const bareName = match?.[2]?.toUpperCase();
    if (
      !match ||
      token === "" ||
      (bareName !== undefined &&
        !AMINO_ACIDS.has(bareName) &&
        !NUCLEOTIDES.has(bareName) &&
        !knownResidueNames.has(bareName))
    ) {
      throw new SelectionSyntaxError(token);
    }
    const residueName = (match[1] ?? match[2])?.toUpperCase();
    const start = match[3] === undefined ? null : Number(match[3]);
    const end = match[4] === undefined ? start : Number(match[4]);
    const chain = match[5]?.toUpperCase();
    const atomName = match[6]?.toUpperCase();
    const atoms = this.atoms;
    return (i) => {
      const atom = atoms[i];
      if (!atom) {
        return false;
      }
      if (residueName !== undefined && atom.residueName.toUpperCase() !== residueName) {
        return false;
      }
      if (start !== null && end !== null && (atom.residueNumber < start || atom.residueNumber > end)) {
        return false;
      }
      if (chain !== undefined && chain !== "*" && atom.chain.toUpperCase() !== chain) {
        return false;
      }
      if (atomName !== undefined && atomName !== "*" && atom.name.toUpperCase() !== atomName) {
        return false;
      }
      return true;
    };
  }
}
