/**
 * MolScopeConstants.ts
 *
 * Central repository for every named numeric constant used across the
 * simulation. Bare numbers that carry semantic meaning (sizes, margins,
 * physics defaults, ranges) belong here rather than inline in model or view
 * code, so they are named, documented, and changed in one place.
 *
 * Conventions
 * ───────────
 *  - Physics / model values use SI units (metres, seconds, kilograms, …);
 *    note the unit in a comment on each value.
 *  - Layout / chrome values are in screen pixels.
 *  - Colour strings live in MolScopeColors.ts, not here.
 *  - Computed expressions (e.g. `2 * Math.PI`) may stay inline.
 *
 * Remove the example constants below and replace them with the sim's own.
 */

import MolScopeNamespace from "./MolScopeNamespace.js";

// ── Layout / chrome (screen pixels) ───────────────────────────────────────────

/** Margin between the screen edge and edge-anchored controls (e.g. Reset All). */
export const SCREEN_VIEW_MARGIN = 20;

/** Corner radius shared by control panels and dialogs. */
export const PANEL_CORNER_RADIUS = 6;

// ── Physics / model defaults (SI units) ───────────────────────────────────────

// Example: export const GRAVITY_MPS2 = 9.81; // m/s²

/** Settings for common/MolScopeControlOptions.ts. */
export const MOL_SCOPE_CONTROL_OPTIONS_SETTINGS = {
  /** Slider thumb size width (px). */
  SLIDER_THUMB_SIZE_WIDTH: 12,
  /** Slider thumb size height (px). */
  SLIDER_THUMB_SIZE_HEIGHT: 22,
  /** Standalone slider track size width (px). */
  STANDALONE_SLIDER_TRACK_SIZE_WIDTH: 150,
  /** Standalone slider track size height (px). */
  STANDALONE_SLIDER_TRACK_SIZE_HEIGHT: 3,
  /** Number control slider track size width (px). */
  NUMBER_CONTROL_SLIDER_TRACK_SIZE_WIDTH: 110,
  /** Number control slider track size height (px). */
  NUMBER_CONTROL_SLIDER_TRACK_SIZE_HEIGHT: 3,
  /** Checkbox box width (px). */
  CHECKBOX_BOX_WIDTH: 16,
  /** Mol scope number control options scale (dimensionless). */
  MOL_SCOPE_NUMBER_CONTROL_OPTIONS_SCALE: 0.75,
  /** Mol scope number control options slider padding (px). */
  MOL_SCOPE_NUMBER_CONTROL_OPTIONS_SLIDER_PADDING: 4,
  /** Mol scope number control options arrow button spacing (px). */
  MOL_SCOPE_NUMBER_CONTROL_OPTIONS_ARROW_BUTTON_SPACING: 3,
  /** Mol scope number control options vertical spacing (px). */
  MOL_SCOPE_NUMBER_CONTROL_OPTIONS_VERTICAL_SPACING: 4,
  /** Mol scope checkbox options spacing (px). */
  MOL_SCOPE_CHECKBOX_OPTIONS_SPACING: 4,
} as const;

/** Settings for common/MolScopePanel.ts. */
export const MOL_SCOPE_PANEL_SETTINGS = {
  /** Options x margin (px). */
  OPTIONS_X_MARGIN: 12,
  /** Options y margin (px). */
  OPTIONS_Y_MARGIN: 10,
} as const;

/** Settings for common/MolScopeScreenIcons.ts. */
export const MOL_SCOPE_SCREEN_ICONS_SETTINGS = {
  ARROW_X_SEGMENT_2: 380, // px
  ARROW_X_SEGMENT_3: 470, // px
  ARROW_X_SEGMENT_4: 380, // px
  CREATE_CRYSTALS_ICON_WIDTH: 10, // px

  /** Default width (px). */
  DEFAULT_WIDTH: 26,
  /** Arrow x (px). */
  ARROW_X: 70,
} as const;

/** Settings for common/model/BondPerception.ts. */
export const BOND_PERCEPTION_SETTINGS = {
  /** Jmol's default `bondTolerance`, Å. */
  BOND_TOLERANCE: 0.45,
  /** Jmol's default `minBondDistance`, Å. */
  MIN_BOND_DISTANCE: 0.4,
  /** Pauling electronegativity at or above which an element counts as an anion former (S, N, O, halogens…). */
  ANION_ELECTRONEGATIVITY: 2.5,
} as const;

/** Settings for common/model/CartoonGeometry.ts. */
export const CARTOON_GEOMETRY_SETTINGS = {
  /** Spline samples per residue interval. */
  SAMPLES_PER_RESIDUE: 6,
  /** Ribbon half-widths, Å. */
  HELIX_HALF_WIDTH: 1.25,
  /** Sheet half width (Å). */
  SHEET_HALF_WIDTH: 1.1,
  /** Arrow half width (Å). */
  ARROW_HALF_WIDTH: 1.8,
  /** Tube radius (Å). */
  TUBE_RADIUS: 0.3,
  /** Largest lead-atom gap still drawn as connected, Å (Cα–Cα is 3.8, P–P about 7). */
  MAX_PROTEIN_GAP: 4.5,
  /** Max nucleic gap (Å). */
  MAX_NUCLEIC_GAP: 8.5,
} as const;

/** Settings for common/model/DisplayState.ts. */
export const DISPLAY_STATE_SETTINGS = {
  /** Jmol's default stick radius, Å (`wireframe 0.15`). */
  STICK_RADIUS: 0.15,
  /** Ball-and-stick ball size, fraction of the van der Waals radius (Jmol `spacefill 20%`). */
  BALL_FRACTION: 0.2,
} as const;

/** Settings for common/model/HydrogenBonds.ts. */
export const HYDROGEN_BONDS_SETTINGS = {
  /** Hbond min distance (Å). */
  HBOND_MIN_DISTANCE: 2.5,
  /** Hbond max distance (Å). */
  HBOND_MAX_DISTANCE: 3.5,
} as const;

/** Settings for common/model/Polyhedra.ts. */
export const POLYHEDRA_SETTINGS = {
  /** Min coordination (count). */
  MIN_COORDINATION: 4,
  /** Max coordination (count). */
  MAX_COORDINATION: 12,
} as const;

/** Settings for common/model/UnitCell.ts. */
export const UNIT_CELL_SETTINGS = {
  /** Fractional-coordinate tolerance for deduplication and cell-face inclusion. */
  FRACTIONAL_TOLERANCE: 0.01,
} as const;

/** Settings for common/model/ViewerModel.ts. */
export const VIEWER_MODEL_SETTINGS = {
  /** Default spin rate, degrees per second (Jmol `spin on` uses 30). */
  DEFAULT_SPIN_RATE: 30,
  /** Frames per second for trajectory animation. */
  ANIMATION_FPS: 10,
  /** Zoom limits, multiples of the fitted view. */
  MIN_ZOOM: 0.2,
  /** Max zoom (dimensionless). */
  MAX_ZOOM: 20,
  /** Lines kept in the script-console history. */
  MAX_CONSOLE_LINES: 200,
  /** Radius default (Å). */
  RADIUS_DEFAULT: 5,
} as const;

/** Settings for common/view/ControlFactory.ts. */
export const CONTROL_FACTORY_SETTINGS = {
  ITEMS_MAX_WIDTH_OFFSET: 40, // px
  RADIO_GROUP_SPACING: 4, // px

  /** Control font size (px). */
  CONTROL_FONT_SIZE: 13,
  /** Small font size (px). */
  SMALL_FONT_SIZE: 12,
  /** Heading font size (px). */
  HEADING_FONT_SIZE: 14,
  /** Combo box x margin (px). */
  COMBO_BOX_X_MARGIN: 8,
  /** Combo box y margin (px). */
  COMBO_BOX_Y_MARGIN: 3,
  /** Combo box corner radius (px). */
  COMBO_BOX_CORNER_RADIUS: 4,
  /** Labeled spacing (px). */
  LABELED_SPACING: 3,
  /** Push button x margin (px). */
  PUSH_BUTTON_X_MARGIN: 8,
  /** Push button y margin (px). */
  PUSH_BUTTON_Y_MARGIN: 4,
  /** Radio group radius (px). */
  RADIO_GROUP_RADIUS: 6,
  /** Pair row spacing (px). */
  PAIR_ROW_SPACING: 8,
} as const;

/** Settings for common/view/MoleculeRenderer.ts. */
export const MOLECULE_RENDERER_SETTINGS = {
  ADD_NUCLEIC_RUNGS_SIZE_FACTOR: 2.4, // dimensionless
  PAINT_CYLINDER_LINE_WIDTH_FACTOR: 0.7, // dimensionless
  PAINT_OVERLAYS_LINE_WIDTH: 3, // px
  PAINT_AXES_LINE_WIDTH: 2.5, // px

  /** Camera distance in units of the bounding radius (Jmol's default `cameraDepth` is 3). */
  CAMERA_DEPTH: 3,
  /** Sprite resolution for shaded spheres, px. */
  SPRITE_SIZE: 128,
  /** Sprites kept before the cache is flushed (continuous colour schemes create many). */
  MAX_SPRITES: 512,
  /** Thin wireframe line width, px. */
  WIRE_WIDTH: 1.6,
  /** Minimum pick radius, px, so thin wireframe atoms are still clickable. */
  MIN_PICK_RADIUS: 6,
  /** Line width line width (px). */
  LINE_WIDTH_LINE_WIDTH: 1.5,
} as const;

/** Settings for common/view/MoleculeViewerNode.ts. */
export const MOLECULE_VIEWER_NODE_SETTINGS = {
  /** Degrees of rotation per pixel of drag. */
  DEGREES_PER_PIXEL: 0.5,
  /** Degrees per arrow-key press. */
  KEY_ROTATION: 10,
  /** Pixels of movement below which a press-release counts as a click. */
  CLICK_SLOP: 4,
  /** Zoom factor per wheel notch / key press. */
  ZOOM_STEP: 1.15,
  /** Label font size (px). */
  LABEL_FONT_SIZE: 12,
  /** Tooltip font size (px). */
  TOOLTIP_FONT_SIZE: 12,
  /** Tooltip background corner radius (px). */
  TOOLTIP_BACKGROUND_CORNER_RADIUS: 4,
  /** Tooltip background opacity (dimensionless). */
  TOOLTIP_BACKGROUND_OPACITY: 0.92,
} as const;

/** Settings for common/view/ScriptConsoleNode.ts. */
export const SCRIPT_CONSOLE_NODE_SETTINGS = {
  CONTENT_ITEM_1_SPACING: 8, // px
  CONSOLE_HEADING_MAX_WIDTH: 60, // px

  /** Output lines visible at once. */
  VISIBLE_LINES: 4,
  /** Commands remembered for the up/down history. */
  HISTORY_SIZE: 50,
  /** Output max height (px). */
  OUTPUT_MAX_HEIGHT: 64,
  /** Content spacing (px). */
  CONTENT_SPACING: 4,
  /** Constructor y margin (px). */
  CONSTRUCTOR_Y_MARGIN: 6,
} as const;

/** Settings for common/view/StructureInfoPanel.ts. */
export const STRUCTURE_INFO_PANEL_SETTINGS = {
  /** Measurements listed before older ones scroll off. */
  MAX_LISTED_MEASUREMENTS: 5,
  /** Title text max height (px). */
  TITLE_TEXT_MAX_HEIGHT: 80,
  /** Selection buttons spacing (px). */
  SELECTION_BUTTONS_SPACING: 6,
  /** Measurement box spacing (px). */
  MEASUREMENT_BOX_SPACING: 4,
  /** Content spacing (px). */
  CONTENT_SPACING: 8,
} as const;

/** Settings for common/view/ViewerControlPanel.ts. */
export const VIEWER_CONTROL_PANEL_SETTINGS = {
  CELLS_LABEL_MAX_WIDTH: 60, // px

  /** Cell radio spacing (px). */
  CELL_RADIO_SPACING: 4,
  /** Cell radio radius (px). */
  CELL_RADIO_RADIUS: 6,
  /** Constructor spacing (px). */
  CONSTRUCTOR_SPACING: 4,
  /** Arrow options x margin (px). */
  ARROW_OPTIONS_X_MARGIN: 4,
  /** Arrow options y margin (px). */
  ARROW_OPTIONS_Y_MARGIN: 4,
  /** Frame row spacing (px). */
  FRAME_ROW_SPACING: 6,
  /** Frame row max width (px). */
  FRAME_ROW_MAX_WIDTH: 110,
  /** Animation box spacing (px). */
  ANIMATION_BOX_SPACING: 6,
  /** Content spacing (px). */
  CONTENT_SPACING: 8,
} as const;

/** Settings for common/view/ViewerScreenView.ts. */
export const VIEWER_SCREEN_VIEW_SETTINGS = {
  /** Panel widths and console height, view px. */
  LEFT_PANEL_WIDTH: 210,
  /** Right panel width (px). */
  RIGHT_PANEL_WIDTH: 236,
  /** Console height (px). */
  CONSOLE_HEIGHT: 96,
  /** Gap (px). */
  GAP: 8,
} as const;

/** Settings for common/view/formatters.ts. */
export const FORMATTERS_SETTINGS = {
  FORMAT_POSITION_X_FACTOR: 3, // dimensionless
  FORMAT_POSITION_X: 3, // px
  FORMAT_POSITION_Y_FACTOR: 3, // dimensionless
  FORMAT_POSITION_Y: 3, // px

  /** Maximum characters of a file-supplied title shown in panels. */
  MAX_TITLE_LENGTH: 90,
} as const;

/** Settings for preferences/MolScopePreferencesNode.ts. */
export const MOL_SCOPE_PREFERENCES_NODE_SETTINGS = {
  /** Header font size (px). */
  HEADER_FONT_SIZE: 18,
  /** Perspective checkbox font size (px). */
  PERSPECTIVE_CHECKBOX_FONT_SIZE: 14,
  /** Perspective checkbox spacing (px). */
  PERSPECTIVE_CHECKBOX_SPACING: 8,
  /** Constructor spacing (px). */
  CONSTRUCTOR_SPACING: 12,
} as const;

/** Settings for common/model/Geometry.ts; units are documented per value. */
export const GEOMETRY_NUMERICS = {
  /** Minimum vector magnitude used for normalization (in input vector units). */
  MIN_VECTOR_LENGTH: 1e-12,
} as const;

/** Settings for common/model/Polyhedra.ts; units are documented per value. */
export const POLYHEDRA_NUMERICS = {
  /** Tolerance for the scalar triple product when testing coplanar coordination faces (Å³). */
  FACE_COPLANAR_TOLERANCE: 1e-3,
} as const;

/** Settings for common/model/UnitCell.ts; units are documented per value. */
export const UNIT_CELL_NUMERICS = {
  /** Tolerance for snapping a wrapped fractional coordinate to zero (dimensionless). */
  WRAPPED_COORDINATE_TOLERANCE: 1e-9,
} as const;

/** Settings for common/model/StructureBuilder.ts; units are documented per value. */
export const STRUCTURE_BUILDER_SETTINGS = {
  /** Minimum Cα(i)–Cα(i+3) separation for a helical assignment (Å). */
  HELIX_I3_MIN_DISTANCE: 4.6,
  /** Maximum Cα(i)–Cα(i+3) separation for a helical assignment (Å). */
  HELIX_I3_MAX_DISTANCE: 5.7,
  /** Minimum Cα(i)–Cα(i+4) separation for a helical assignment (Å). */
  HELIX_I4_MIN_DISTANCE: 5.6,
  /** Maximum Cα(i)–Cα(i+4) separation for a helical assignment (Å). */
  HELIX_I4_MAX_DISTANCE: 6.8,
  /** Minimum Cα(i)–Cα(i+2) separation for a sheet assignment (Å). */
  SHEET_I2_MIN_DISTANCE: 6.3,
  /** Minimum Cα(i)–Cα(i+4) separation for a sheet assignment (Å). */
  SHEET_I4_MIN_DISTANCE: 12.4,
} as const;

/** Settings for common/model/ViewerModel.ts; units are documented per value. */
export const ATOM_RADIUS_DEFAULTS = {
  /** Fallback van der Waals radius for a missing atom (Å). */
  FALLBACK_VDW_RADIUS: 1.5,
} as const;

/** Settings for common/model/DisplayState.ts; units are documented per value. */
export const DISPLAY_RADIUS_DEFAULTS = {
  /** Fallback van der Waals radius for a missing atom (Å). */
  FALLBACK_VDW_RADIUS: 1.5,
} as const;

/** Settings for common/model/ScriptEngine.ts; units are documented per value. */
export const SCRIPT_ENGINE_SETTINGS = {
  /** Zoom multiplier for the default zoom-out command (dimensionless). */
  ZOOM_OUT_FACTOR: 0.8,
  /** Maximum repeat count along a crystal packing axis (cells). */
  MAX_CELL_PACKING: 4,
} as const;

MolScopeNamespace.register("MolScopeConstants", {
  SCREEN_VIEW_MARGIN,
  PANEL_CORNER_RADIUS,
});
