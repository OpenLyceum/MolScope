# MolScope — model

What the viewer computes, and the conventions it shares with Jmol. Everything here lives in the
Scenery-free modules under `src/common/model/`.

## Structures

A structure is a list of atoms (element, name, residue, chain, B-factor, occupancy, charge), a
list of bonds with orders, residues, and one or more frames of Cartesian coordinates in ångströms.

| Format | Read | Notes |
|---|---|---|
| PDB | ATOM/HETATM, HELIX/SHEET, CONECT, CRYST1, MODEL | First alternate location only; NMR ensembles become frames |
| MOL/SDF (V2000) | atoms, bonds with orders, charges | Aromatic bonds (type 4) become order 1.5; compatible conformer records become frames |
| XYZ | element, x, y, z [, vx, vy, vz] | Multi-frame trajectories; the optional triple is a vibration vector |
| CIF | cell, symmetry operators, fractional sites | Packed into 1–4 cells per axis; `0.465(4)` reads as 0.465 |

Multi-record MOL/SDF files become frames only when atom identities/order, formal charges and
the explicit bond graph match. XYZ trajectories require the same element sequence. Incompatible
records are rejected with a translated error rather than showing one molecule's coordinates
with another molecule's chemistry. Every frame's coordinates and optional vibration vectors must
be present and finite before a structure is installed; a rejected import preserves the loaded
structure and camera.

### Bonding

Jmol's autobond rule: atoms *i*, *j* are bonded when

  0.4 Å < d(i, j) < r_cov(i) + r_cov(j) + 0.45 Å

with covalent radii from Cordero et al. (2008). A spatial hash with cells of 2·r_max + 0.45 Å keeps
it linear in the atom count. Explicit MOL/CONECT bonds take precedence (they carry orders).

In crystals (CIF), ionic contacts need two extra rules so the picture matches the chemistry:
like atoms are never bonded when the crystal has several elements (Cs–Cs in CsCl lies inside the
cut-off), and when anion formers (Pauling χ ≥ 2.5) are present, cation–cation contacts are skipped
(Ca–Ti in perovskite). Pure metals keep their metal–metal bonds.

### Secondary structure

From HELIX/SHEET records when present. Otherwise (as with Jmol's `calculate structure`) from Cα
geometry: Cα(i)–Cα(i+3) of 4.6–5.7 Å with Cα(i)–Cα(i+4) of 5.6–6.8 Å marks a helix; an extended
Cα(i)–Cα(i+2) > 6.3 Å run marks a strand. This is a coarse fallback, not DSSP, so the info panel
says which source a protein's secondary structure came from (`Structure.secondaryStructureSource`).

### Unit cells

The cell matrix puts **a** along x and **b** in the xy plane (the PDB/CIF convention). Symmetry
operators such as `-y,x-y,1/3+z` are parsed into a rotation and translation on fractional
coordinates. `packCell` applies every operator, wraps into [0, 1), removes duplicates within 0.01
(fractional), and replicates over the requested cells *including* sites on the far faces, so a
1×1×1 rock-salt cell shows the familiar 27 ions.

The loaded `Structure.cellRange` retains all three packing dimensions. Its outline uses those
dimensions, including asymmetric script requests. Cubic presets offer 1, 2 and 3 cells per axis;
other ranges appear as a selected Custom choice. A newly imported CIF starts at 1×1×1 and its
source text is retained so the same presets can repack it.

## Measurements

- distance |**b** − **a**| in Å;
- angle ∠abc in degrees;
- torsion a–b–c–d about b→c in degrees, IUPAC sign (clockwise looking from b to c is positive),
  computed as atan2(((**n₁** × **n₂**) · **b̂₂**), **n₁** · **n₂**).

Values are recomputed from the displayed positions each frame, so they follow trajectories and
vibrations in both the canvas and sidebar, including when vibration is switched off.

## Display model

Per atom: sphere radius, bond radius (or "thin line"), colour, label, cartoon / trace / backbone
flags, hidden, selected. `hidden` combines `hide` / `restrict` with the Hydrogens toggle, which
are stored separately so neither overwrites the other. Commands and menus act on the selection.
A menu only acts when its value changes, so **Apply to selection** re-applies the current style,
colour and labels; **Select all** / **Select none** (shown in Select mode, or whenever only part
of the structure is selected) reset the selection. Presets (the Style menu):

| Style | Spheres | Bonds |
|---|---|---|
| Wireframe | off | 1.6 px lines |
| Sticks | 0.15 Å (caps the joints) | 0.15 Å |
| Ball & stick | 20 % of van der Waals radius | 0.15 Å |
| Space-filling | 100 % of van der Waals radius | off |
| Cartoon / trace / backbone | polymer atoms off; ligands ball & stick; water hidden | — |

Colour schemes: `cpk` (Jmol element colours), `chain` (Jmol chain palette), `structure` (helix
magenta, sheet gold, nucleic violet), `temperature` (B-factor, blue–white–red), `amino` (RasMol
residue colours), `group` (rainbow N→C along each chain), `formalCharge`.

### Hydrogen bonds

Without explicit hydrogens (most crystal structures), a donor/acceptor pair of N/O atoms
2.5–3.5 Å apart, in different residues, not bonded and not sharing a bonded neighbour, is drawn as
a hydrogen bond. Geometric and permissive: it shows helix i→i+4 and base-pair patterns but no
angle criterion is applied. A note under the Hydrogen bonds checkbox says so while it is on.

### Coordination polyhedra

Around atoms less electronegative than all their bonded neighbours, with 4–12 neighbours, the
convex hull of the neighbours is drawn. When several cation types qualify, only those with the
smallest coordination number are shown (TiO₆, not CaO₁₂, in perovskite); cations cut by the edge of
the packed block are skipped.

### Vibrations and animation

An extended-XYZ frame with displacement vectors animates as **r**(t) = **r**₀ + **v** sin(2πt / 1 s).
The library's H₂O and CO₂ modes are illustrative: directions are the textbook normal modes with
the heavy-atom recoil chosen to conserve momentum; amplitudes are exaggerated for visibility and
not mass-weighted eigenvectors. Multi-frame files play at 10 frames/s.

## Script language

Commands are separated by `;` or new lines; `#` starts a comment; execution stops at the first
error, like Jmol.

| Command | Effect |
|---|---|
| `load NAME` / `load $NAME` / `load =PDBID` / `load NAME {n n n}` | Library, PubChem, RCSB, packed cells |
| `select EXPR`, `restrict EXPR`, `display EXPR`, `hide EXPR` | Selection and visibility |
| `spacefill [on/off/Å/n%]`, `cpk`, `wireframe [on/off/Å]`, `style NAME` | Atom and bond size |
| `cartoon`, `trace`, `backbone` `[on/off]` | Polymer shapes |
| `color [SCHEME / NAME / [r,g,b] / [xRRGGBB]]`, `color background C`, `background C` | Colour |
| `label FORMAT` (`%a %e %i %n %r %c %b %q`), `label off` | Labels |
| `measure A B [C [D]]`, `measure (EXPR) (EXPR)`, `measure off` | Measurements by serial number or expression |
| `spin [on/off/°/s]`, `rotate [x/y/z] °`, `zoom [%/in/out]`, `center [EXPR]`, `reset` | Camera |
| `hbonds`, `unitcell`, `axes`, `polyhedra`, `vibration`, `animation` `[on/off]` | Toggles |
| `frame N/next/prev` | Frames |
| `set perspective/halos/hydrogens on/off`, `set picking MODE` | Settings |
| `echo TEXT`, `help` | Console |

Atom expressions: `all none * selected displayed protein nucleic dna rna polymer water hetero
ligand backbone sidechain helix sheet`, element names and `_Sym`, residue specs
`[RES]num-num:chain.atom` (any part optional, `*` wildcard), comparisons on `atomno resno elemno
temperature occupancy formalCharge x y z` and `element chain group atomname`, `within(d, EXPR)`,
combined with `not ! and & or | ,` and parentheses.

A new script, file/menu load or Reset All supersedes an older script operation. A pending old
load cannot install its structure, run later commands on the new molecule, or append output to
the newer console state. Commands within one active script still execute in order.

### Differences from Jmol

MolScope implements a subset. Not supported: surfaces and isosurfaces, `dots`, the full `set`
vocabulary, `define`, variables and flow control, `write`, model kit editing, minimisation, PDB
biological assemblies, mmCIF, and Jmol's DSSP. Integer `spacefill n` uses RasMol units
(n/250 Å) as Jmol does.
