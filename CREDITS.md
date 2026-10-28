# Credits — MolScope

A browser molecular viewer in the spirit of [Jmol](https://jmol.sourceforge.net/), the open-source
Java viewer for chemical structures in 3D. MolScope is an independent implementation: no Jmol code
is used, but its scripting language, colour schemes (CPK, chain, structure, amino) and default
rendering choices are deliberately familiar to Jmol users.

## License

GNU Affero General Public License v3.0 or later — see [org LICENSE](https://github.com/OpenLyceum/.github/blob/main/LICENSE).

## Structure data

The built-in library in `src/common/model/library/data/` is drawn from public-domain sources:

| Files | Source | Terms |
|---|---|---|
| `*.mol` (small molecules) | [PubChem](https://pubchem.ncbi.nlm.nih.gov/) 3D conformers, NIH National Center for Biotechnology Information | Public domain |
| `*.pdb` (1CRN, 1UBQ, 4INS, 1EMA, 2PTC, 1HHO, 4HHB, 1BNA) | [RCSB Protein Data Bank](https://www.rcsb.org/) — first model, coordinate and secondary-structure records only | CC0 1.0 |
| `cod-*.cif` (crystals) | [Crystallography Open Database](https://www.crystallography.net/) | Public domain (CC0) |
| `*.xyz` | Generated for MolScope: idealised SF₆, PCl₅, XeF₄ and C₆₀ geometries, illustrative water and CO₂ normal-mode displacements, an ethane torsion scan | Same as this repository |

Element colours follow Jmol's CPK table; covalent radii are from Cordero et al., *Dalton Trans.*
2008, 2832–2838; van der Waals radii from Bondi (1964) and Alvarez (2013).

The online `load $name` and `load =pdbid` commands fetch from the PubChem PUG REST service and
`files.rcsb.org` at run time.

## Acknowledgments

Built with [SceneryStack](https://scenerystack.org/) as part of the
[OpenLyceum](https://github.com/OpenLyceum) fleet.
