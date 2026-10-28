/**
 * StructureLibrary.ts
 *
 * The built-in, offline structure collection — the equivalent of the sample files
 * that ship with Jmol. Each entry is loaded lazily (Vite turns every data file into
 * its own chunk), so the sim starts fast and the PWA still works offline.
 *
 * Sources (all public domain / CC0):
 *   - small molecules: PubChem 3D conformers (NIH NCBI), *.mol
 *   - biomolecules: RCSB Protein Data Bank, *.pdb (first model, coordinate records only)
 *   - crystals: Crystallography Open Database, cod-*.cif
 *   - generated here: idealised SF₆, PCl₅, XeF₄ and C₆₀ geometries, the water and CO₂
 *     normal modes (extended XYZ with displacement vectors) and an ethane torsion scan.
 */

import type { Vec3 } from "../Geometry.js";

export const LibraryCategory = {
  MOLECULES: "molecules",
  BIOMOLECULES: "biomolecules",
  CRYSTALS: "crystals",
} as const;
export type LibraryCategoryValue = (typeof LibraryCategory)[keyof typeof LibraryCategory];

/** Sub-collections shown as a first combo box, so no single list outgrows the screen. */
export const LibraryGroup = {
  BASICS: "basics",
  SHAPES: "shapes",
  BIOCHEMISTRY: "biochemistry",
  DRUGS: "drugs",
  MOTION: "motion",
  BIOMOLECULES: "biomolecules",
  CRYSTALS: "crystals",
} as const;
export type LibraryGroupValue = (typeof LibraryGroup)[keyof typeof LibraryGroup];

export type LibraryEntry = {
  /** Stable id, also the `load` name in scripts ("caffeine", "1crn", "quartz"). */
  readonly id: string;
  /** Key into the `library` strings group for the display name. */
  readonly nameKey: string;
  readonly category: LibraryCategoryValue;
  readonly group: LibraryGroupValue;
  /** File name under ./data/. */
  readonly file: string;
  /** Extra names `load` accepts (PDB codes, mineral names). */
  readonly aliases?: readonly string[];
  /** Default number of cells to pack, crystals only. */
  readonly range?: Vec3;
};

const loaders = import.meta.glob<string>("./data/*", { query: "?raw", import: "default" });

function molecule(group: LibraryGroupValue, id: string, nameKey: string, file = `${id}.mol`): LibraryEntry {
  return { id, nameKey, category: LibraryCategory.MOLECULES, group, file };
}

function biomolecule(id: string, nameKey: string): LibraryEntry {
  return { id, nameKey, category: LibraryCategory.BIOMOLECULES, group: LibraryGroup.BIOMOLECULES, file: `${id}.pdb` };
}

function crystal(id: string, nameKey: string, codId: string, aliases: readonly string[] = []): LibraryEntry {
  return {
    id,
    nameKey,
    category: LibraryCategory.CRYSTALS,
    group: LibraryGroup.CRYSTALS,
    file: `cod-${codId}.cif`,
    aliases,
    range: [1, 1, 1],
  };
}

export const STRUCTURE_LIBRARY: readonly LibraryEntry[] = [
  molecule(LibraryGroup.BASICS, "water", "water"),
  molecule(LibraryGroup.BASICS, "ammonia", "ammonia"),
  molecule(LibraryGroup.BASICS, "methane", "methane"),
  molecule(LibraryGroup.BASICS, "formaldehyde", "formaldehyde"),
  molecule(LibraryGroup.BASICS, "hydrogen-peroxide", "hydrogenPeroxide"),
  molecule(LibraryGroup.BASICS, "carbon-dioxide", "carbonDioxide"),
  molecule(LibraryGroup.BASICS, "ethylene", "ethylene"),
  molecule(LibraryGroup.BASICS, "acetylene", "acetylene"),
  molecule(LibraryGroup.BASICS, "ethanol", "ethanol"),
  molecule(LibraryGroup.BASICS, "acetic-acid", "aceticAcid"),
  molecule(LibraryGroup.BASICS, "urea", "urea"),
  molecule(LibraryGroup.BASICS, "benzene", "benzene"),
  molecule(LibraryGroup.BASICS, "cyclohexane", "cyclohexane"),
  molecule(LibraryGroup.SHAPES, "sulfur-hexafluoride", "sulfurHexafluoride", "sulfur-hexafluoride.xyz"),
  molecule(LibraryGroup.SHAPES, "phosphorus-pentachloride", "phosphorusPentachloride", "phosphorus-pentachloride.xyz"),
  molecule(LibraryGroup.SHAPES, "xenon-tetrafluoride", "xenonTetrafluoride", "xenon-tetrafluoride.xyz"),
  molecule(LibraryGroup.SHAPES, "buckminsterfullerene", "buckminsterfullerene", "buckminsterfullerene.xyz"),
  molecule(LibraryGroup.BIOCHEMISTRY, "glycine", "glycine"),
  molecule(LibraryGroup.BIOCHEMISTRY, "alanine", "alanine"),
  molecule(LibraryGroup.BIOCHEMISTRY, "phenylalanine", "phenylalanine"),
  molecule(LibraryGroup.BIOCHEMISTRY, "glucose", "glucose"),
  molecule(LibraryGroup.BIOCHEMISTRY, "sucrose", "sucrose"),
  molecule(LibraryGroup.BIOCHEMISTRY, "ascorbic-acid", "ascorbicAcid"),
  molecule(LibraryGroup.BIOCHEMISTRY, "dopamine", "dopamine"),
  molecule(LibraryGroup.BIOCHEMISTRY, "serotonin", "serotonin"),
  molecule(LibraryGroup.BIOCHEMISTRY, "testosterone", "testosterone"),
  molecule(LibraryGroup.BIOCHEMISTRY, "cholesterol", "cholesterol"),
  molecule(LibraryGroup.BIOCHEMISTRY, "adenosine-triphosphate", "adenosineTriphosphate"),
  molecule(LibraryGroup.DRUGS, "caffeine", "caffeine"),
  molecule(LibraryGroup.DRUGS, "nicotine", "nicotine"),
  molecule(LibraryGroup.DRUGS, "aspirin", "aspirin"),
  molecule(LibraryGroup.DRUGS, "paracetamol", "paracetamol"),
  molecule(LibraryGroup.DRUGS, "ibuprofen", "ibuprofen"),
  molecule(LibraryGroup.DRUGS, "capsaicin", "capsaicin"),
  molecule(LibraryGroup.DRUGS, "morphine", "morphine"),
  molecule(LibraryGroup.DRUGS, "penicillin-g", "penicillinG"),
  molecule(LibraryGroup.MOTION, "water-vibrations", "waterVibrations", "water-vibrations.xyz"),
  molecule(
    LibraryGroup.MOTION,
    "carbon-dioxide-vibrations",
    "carbonDioxideVibrations",
    "carbon-dioxide-vibrations.xyz",
  ),
  molecule(LibraryGroup.MOTION, "ethane-rotation", "ethaneRotation", "ethane-rotation.xyz"),

  biomolecule("1crn", "crambin"),
  biomolecule("1ubq", "ubiquitin"),
  biomolecule("4ins", "insulin"),
  biomolecule("1ema", "greenFluorescentProtein"),
  biomolecule("2ptc", "trypsinInhibitor"),
  biomolecule("1hho", "oxyhemoglobin"),
  biomolecule("4hhb", "deoxyhemoglobin"),
  biomolecule("1bna", "dnaDodecamer"),

  crystal("sodium-chloride", "sodiumChloride", "1000041", ["nacl", "halite", "rocksalt"]),
  crystal("cesium-chloride", "cesiumChloride", "9008789", ["cscl"]),
  crystal("diamond", "diamond", "9008564"),
  crystal("graphite", "graphite", "9008569"),
  crystal("quartz", "quartz", "1011097", ["sio2"]),
  crystal("rutile", "rutile", "1534781", ["tio2"]),
  crystal("fluorite", "fluorite", "1000043", ["caf2"]),
  crystal("zinc-blende", "zincBlende", "1100043", ["sphalerite", "zns"]),
  crystal("wurtzite", "wurtzite", "1100044"),
  crystal("perovskite", "perovskite", "1011211", ["catio3"]),
  crystal("copper", "copper", "9008468", ["cu", "fcc"]),
  crystal("iron", "iron", "4113928", ["fe", "bcc"]),
];

export function libraryEntries(category: LibraryCategoryValue): LibraryEntry[] {
  return STRUCTURE_LIBRARY.filter((entry) => entry.category === category);
}

/** Groups present in a category, in library order. */
export function libraryGroups(category: LibraryCategoryValue): LibraryGroupValue[] {
  return [...new Set(libraryEntries(category).map((entry) => entry.group))];
}

export function libraryEntry(id: string): LibraryEntry | null {
  return STRUCTURE_LIBRARY.find((entry) => entry.id === id) ?? null;
}

/** Finds an entry by id, alias or a loose spelling ("Sodium chloride", "sodium_chloride"). */
export function findLibraryEntry(name: string): LibraryEntry | null {
  const key = name.toLowerCase().replace(/[\s_]+/g, "-");
  return (
    STRUCTURE_LIBRARY.find(
      (entry) =>
        entry.id === key ||
        entry.nameKey.toLowerCase() === key.replace(/-/g, "") ||
        (entry.aliases ?? []).includes(key),
    ) ?? null
  );
}

/** Loads the raw text of a library entry. */
export function loadLibraryText(entry: LibraryEntry): Promise<string> {
  const loader = loaders[`./data/${entry.file}`];
  if (!loader) {
    return Promise.reject(new Error(`missing library file ${entry.file}`));
  }
  return loader();
}
