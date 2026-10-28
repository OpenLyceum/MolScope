/**
 * StringManager.ts
 *
 * Centralizes all localized string access for the simulation.
 *
 * Strings are loaded from JSON files per locale and wrapped in reactive
 * Property objects by SceneryStack. When the user switches language in the
 * Preferences dialog, all StringProperties update automatically.
 *
 * ── How to add a locale ───────────────────────────────────────────────────────
 * 1. Create src/i18n/strings_XX.json with the same keys as strings_en.json
 * 2. Import it below and add `XX: stringsXX` to the locale map
 * 3. Add "XX" to `availableLocales` in src/init.ts
 *
 * ── How to add a string ───────────────────────────────────────────────────────
 * 1. Add the key + English value to strings_en.json
 * 2. Add the same key + translated value to ALL other locale files
 *    (TypeScript will show an error here if any locale is missing a key)
 * 3. Expose the new StringProperty via a new getter method below
 */

import type { ReadOnlyProperty } from "scenerystack/axon";
import { LocalizedString } from "scenerystack/chipper";
import stringsEn from "./strings_en.json";
import stringsEs from "./strings_es.json";
import stringsFr from "./strings_fr.json";

// ── Compile-time key-parity check ─────────────────────────────────────────────
// English is the canonical shape; every other locale must match it exactly.
// TypeScript errors here if any locale file is missing (or adds) a key relative to
// English. Add one `satisfies` line per new locale so the check stays exhaustive.
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsFr satisfies typeof stringsEn);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEn satisfies typeof stringsFr);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEs satisfies typeof stringsEn);
// biome-ignore lint/complexity/noVoid: intentional compile-time type assertion
void (stringsEn satisfies typeof stringsEs);

// ── Build the reactive string property tree ───────────────────────────────────
const stringProperties = LocalizedString.getNestedStringProperties({
  en: stringsEn,
  fr: stringsFr,
  es: stringsEs,
});

/**
 * StringManager is a singleton that provides typed access to all localized
 * strings. Use `StringManager.getInstance()` everywhere — never construct it
 * directly.
 */
export class StringManager {
  private static instance: StringManager | null = null;

  private constructor() {
    // Private — obtain via getInstance()
  }

  public static getInstance(): StringManager {
    if (StringManager.instance === null) {
      StringManager.instance = new StringManager();
    }
    return StringManager.instance;
  }

  /**
   * The simulation title shown in the navigation bar and browser tab.
   * Updates automatically when the locale changes.
   */
  public getTitleStringProperty(): ReadOnlyProperty<string> {
    return stringProperties.titleStringProperty;
  }

  /**
   * Screen name StringProperties used when constructing Screen instances.
   * Each property updates automatically when the locale changes.
   */
  public getScreenNames(): {
    readonly moleculesStringProperty: ReadOnlyProperty<string>;
    readonly biomoleculesStringProperty: ReadOnlyProperty<string>;
    readonly crystalsStringProperty: ReadOnlyProperty<string>;
  } {
    return {
      moleculesStringProperty: stringProperties.screens.moleculesStringProperty,
      biomoleculesStringProperty: stringProperties.screens.biomoleculesStringProperty,
      crystalsStringProperty: stringProperties.screens.crystalsStringProperty,
    };
  }

  /** Shared accessibility strings (viewer, selectors, live details). */
  public getCommonA11yStrings() {
    return stringProperties.a11y.common;
  }

  /** Accessibility strings for the Molecules screen. */
  public getMoleculesA11yStrings() {
    return stringProperties.a11y.molecules;
  }

  /** Accessibility strings for the Biomolecules screen. */
  public getBiomoleculesA11yStrings() {
    return stringProperties.a11y.biomolecules;
  }

  /** Accessibility strings for the Crystals screen. */
  public getCrystalsA11yStrings() {
    return stringProperties.a11y.crystals;
  }

  /** Control-panel labels. */
  public getControls() {
    return stringProperties.controls;
  }

  /** Structure-collection names, keyed by LibraryGroup value. */
  public getGroups() {
    return stringProperties.groups;
  }

  /** Rendering-style names, keyed by DisplayStyle value. */
  public getStyles() {
    return stringProperties.styles;
  }

  /** Colour-scheme names, keyed by ColorScheme value. */
  public getColorSchemes() {
    return stringProperties.colorSchemes;
  }

  /** Label-mode names, keyed by LabelMode value. */
  public getLabelModes() {
    return stringProperties.labelModes;
  }

  /** Mouse picking-mode names, keyed by PickingMode value. */
  public getPickingModes() {
    return stringProperties.picking;
  }

  /** One-line usage hints per picking mode. */
  public getHints() {
    return stringProperties.hints;
  }

  /** Info-panel patterns. */
  public getInfo() {
    return stringProperties.info;
  }

  /** Measurement unit patterns. */
  public getUnits() {
    return stringProperties.units;
  }

  /** Axis and unit-cell corner labels drawn in the viewer. */
  public getAxisLabels() {
    return stringProperties.axisLabels;
  }

  /** Script-console message patterns, keyed by ScriptMessageKey. */
  public getScriptMessages() {
    return stringProperties.script;
  }

  /** Keyboard-help dialog labels. */
  public getKeyboardHelp() {
    return stringProperties.keyboardHelp;
  }

  /** Display names for the built-in structure library, keyed by LibraryEntry.nameKey. */
  public getLibraryNames() {
    return stringProperties.library;
  }

  /**
   * Simulation-specific preference labels shown in Preferences → Simulation.
   */
  public getPreferences() {
    return stringProperties.preferences;
  }
}
