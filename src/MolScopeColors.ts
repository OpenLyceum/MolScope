/**
 * MolScopeColors.ts
 *
 * Defines all dynamic colors for the simulation using ProfileColorProperty.
 *
 * Each color has two profiles:
 *   - "default"   — used in standard (dark) mode
 *   - "projector" — used when the user enables Projector Mode in Preferences
 *
 * SceneryStack switches profiles automatically; no manual toggling is needed.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 * Import MolScopeColors and pass properties directly to Node's fillProperty or
 * strokeProperty options:
 *
 *   import MolScopeColors from "../../MolScopeColors.js";
 *
 *   new Rectangle( 0, 0, 100, 50, {
 *     fillProperty: MolScopeColors.backgroundColorProperty,
 *   });
 *
 * ── How to add a color ────────────────────────────────────────────────────────
 * Add a new ProfileColorProperty entry to the MolScopeColors object below.
 * Always provide both "default" and "projector" values.
 */
import { ProfileColorProperty } from "scenerystack/scenery";
import MolScopeNamespace from "./MolScopeNamespace.js";

const MolScopeColors = {
  /**
   * Background color for the simulation screen.
   * Deep navy in default mode; white in projector mode.
   */
  backgroundColorProperty: new ProfileColorProperty(MolScopeNamespace, "background", {
    default: "#1a1a2e",
    projector: "#ffffff",
  }),

  /**
   * Primary accent color for highlights, selected items, and key UI elements.
   * Sky blue in default mode; dark navy in projector mode.
   */
  accentColorProperty: new ProfileColorProperty(MolScopeNamespace, "accent", {
    default: "#4fc3f7",
    projector: "#1a1a2e",
  }),

  /**
   * Background fill for control panels and dialogs.
   * Deep blue in default mode; light gray in projector mode.
   */
  panelBackgroundColorProperty: new ProfileColorProperty(MolScopeNamespace, "panelBackground", {
    default: "#16213e",
    projector: "#f5f5f5",
  }),

  /**
   * Border/stroke color for control panels and dialogs.
   * Teal-navy in default mode; medium gray in projector mode.
   */
  panelBorderColorProperty: new ProfileColorProperty(MolScopeNamespace, "panelBorder", {
    default: "#0f3460",
    projector: "#999999",
  }),

  /**
   * Text color for labels, readouts, and general UI text.
   * Near-white in default mode; near-black in projector mode.
   */
  textColorProperty: new ProfileColorProperty(MolScopeNamespace, "text", {
    default: "#e0e0e0",
    projector: "#1a1a1a",
  }),

  // ── Light control surfaces ───────────────────────────────────────────────────
  // White chrome (combo boxes, flat push buttons, editable input fields) stays light
  // in both profiles; its text stays dark. Same values in default and projector mode,
  // but defined here so every color lives in one themeable place.

  /** Fill of light control surfaces: combo-box button/list, editable input fields. */
  controlSurfaceColorProperty: new ProfileColorProperty(MolScopeNamespace, "controlSurface", {
    default: "#ffffff",
    projector: "#ffffff",
  }),

  /** Fill of a disabled control surface (grayed-out editable input field). */
  controlSurfaceDisabledColorProperty: new ProfileColorProperty(MolScopeNamespace, "controlSurfaceDisabled", {
    default: "#cccccc",
    projector: "#cccccc",
  }),

  /** Text on light control surfaces: combo items, flat-button labels, field values, preferences. */
  controlSurfaceTextColorProperty: new ProfileColorProperty(MolScopeNamespace, "controlSurfaceText", {
    default: "#1a1a1a",
    projector: "#1a1a1a",
  }),
  // ── 3D viewer overlays ───────────────────────────────────────────────────────
  // Atom and residue colours are data (Jmol's CPK, chain and structure palettes in
  // common/model/ColorSchemes.ts); these are the viewer's own annotation colours.

  /** Atom labels drawn next to atoms. */
  labelColorProperty: new ProfileColorProperty(MolScopeNamespace, "label", {
    default: "#ffffff",
    projector: "#111111",
  }),

  /** Dashed measurement lines and their values. */
  measurementColorProperty: new ProfileColorProperty(MolScopeNamespace, "measurement", {
    default: "#ffd54f",
    projector: "#b8860b",
  }),

  /** Unit-cell edges. */
  unitCellColorProperty: new ProfileColorProperty(MolScopeNamespace, "unitCell", {
    default: "#b0bec5",
    projector: "#37474f",
  }),

  /** Selection halos (Jmol's yellow glow). */
  selectionHaloColorProperty: new ProfileColorProperty(MolScopeNamespace, "selectionHalo", {
    default: "rgba(255,235,59,0.75)",
    projector: "rgba(255,160,0,0.8)",
  }),

  /** Ring around the atom under the pointer or keyboard cursor. */
  hoverColorProperty: new ProfileColorProperty(MolScopeNamespace, "hover", {
    default: "#80deea",
    projector: "#00838f",
  }),

  /** Rings marking atoms picked for a measurement still in progress. */
  pickColorProperty: new ProfileColorProperty(MolScopeNamespace, "pick", {
    default: "#69f0ae",
    projector: "#1b5e20",
  }),

  /** Dashed hydrogen bonds. */
  hydrogenBondColorProperty: new ProfileColorProperty(MolScopeNamespace, "hydrogenBond", {
    default: "#f48fb1",
    projector: "#ad1457",
  }),

  /** Orientation-gizmo x, y, z axes (red, green, blue by convention). */
  axisXColorProperty: new ProfileColorProperty(MolScopeNamespace, "axisX", {
    default: "#ef5350",
    projector: "#c62828",
  }),
  axisYColorProperty: new ProfileColorProperty(MolScopeNamespace, "axisY", {
    default: "#66bb6a",
    projector: "#2e7d32",
  }),
  axisZColorProperty: new ProfileColorProperty(MolScopeNamespace, "axisZ", {
    default: "#42a5f5",
    projector: "#1565c0",
  }),

  /** Script console: output text, typed commands, and errors. */
  consoleTextColorProperty: new ProfileColorProperty(MolScopeNamespace, "consoleText", {
    default: "#c8e6c9",
    projector: "#1b5e20",
  }),
  consoleInputColorProperty: new ProfileColorProperty(MolScopeNamespace, "consoleInput", {
    default: "#90caf9",
    projector: "#0d47a1",
  }),
  consoleErrorColorProperty: new ProfileColorProperty(MolScopeNamespace, "consoleError", {
    default: "#ef9a9a",
    projector: "#b71c1c",
  }),

  /** Secondary text: hints, units, status lines. */
  mutedTextColorProperty: new ProfileColorProperty(MolScopeNamespace, "mutedText", {
    default: "#9aa5b8",
    projector: "#555555",
  }),
};

export default MolScopeColors;
