/**
 * RemoteSources.ts
 *
 * Online databases reachable from `load $name` and `load =code`, as in Jmol:
 * PubChem 3D conformers (by compound name) and the RCSB Protein Data Bank (by
 * four-character ID). Both serve CORS-enabled plain text.
 */

export const PUBCHEM_SDF_URL = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/SDF?record_type=3d";
export const RCSB_PDB_URL = "https://files.rcsb.org/download/{id}.pdb";

export function pubChemUrl(name: string): string {
  return PUBCHEM_SDF_URL.replace("{name}", encodeURIComponent(name.trim()));
}

/** PDB IDs are four characters: a digit then three alphanumerics. */
export function isPdbId(id: string): boolean {
  return /^[0-9][A-Za-z0-9]{3}$/.test(id.trim());
}

export function rcsbUrl(id: string): string {
  return RCSB_PDB_URL.replace("{id}", id.trim().toUpperCase());
}

/** Fetches text, turning HTTP errors into exceptions with the status as the message. */
export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}
