/**
 * ViewerControlPanel.ts
 *
 * The right-hand panel: what to show (collection, structure, open file), how to show
 * it (style, colour scheme, labels), display toggles, crystal cell controls, and
 * frame/vibration animation. Every control routes through the same ViewerModel
 * operations as the script console.
 */

import { DerivedProperty, Multilink, NumberProperty, PatternStringProperty, Property } from "scenerystack/axon";
import { StringUtils } from "scenerystack/phetcommon";
import { HBox, HSeparator, Node, RichText, Text, VBox } from "scenerystack/scenery";
import { AquaRadioButtonGroup, ArrowButton } from "scenerystack/sun";
import { StringManager } from "../../i18n/StringManager.js";
import MolScopeColors from "../../MolScopeColors.js";
import { FLAT_RECTANGULAR_BUTTON_OPTIONS } from "../MolScopeButtonOptions.js";
import { MolScopePanel } from "../MolScopePanel.js";
import type { ColorSchemeValue } from "../model/ColorSchemes.js";
import type { DisplayStyleValue } from "../model/DisplayState.js";
import { LabelMode, type LabelModeValue } from "../model/DisplayState.js";
import { HBOND_MAX_DISTANCE, HBOND_MIN_DISTANCE } from "../model/HydrogenBonds.js";
import type { LibraryGroupValue } from "../model/library/StructureLibrary.js";
import { libraryEntry, libraryGroups } from "../model/library/StructureLibrary.js";
import { CUSTOM_ENTRY_ID, type ViewerModel } from "../model/ViewerModel.js";
import {
  CONTROL_FONT,
  type ComboChoice,
  checkbox,
  comboBox,
  heading,
  label,
  labeled,
  pairRow,
  pushButton,
  SMALL_FONT,
} from "./ControlFactory.js";
import { disposeSubtree } from "./disposeSubtree.js";

export type ViewerControlPanelOptions = {
  readonly styles: readonly DisplayStyleValue[];
  readonly colorSchemes: readonly ColorSchemeValue[];
  readonly showBiomoleculeOptions: boolean;
  readonly showCrystalOptions: boolean;
  readonly openFile: () => void;
  readonly width: number;
};

export class ViewerControlPanel extends MolScopePanel {
  private readonly disposeViewerControlPanel: () => void;

  public constructor(model: ViewerModel, listParent: Node, options: ViewerControlPanelOptions) {
    const strings = StringManager.getInstance();
    const controls = strings.getControls();
    const info = strings.getInfo();
    const a11y = strings.getCommonA11yStrings();
    const names = strings.getLibraryNames() as unknown as Record<string, Property<string>>;
    const groupNames = strings.getGroups() as unknown as Record<string, Property<string>>;
    const styleNames = strings.getStyles() as unknown as Record<string, Property<string>>;
    const schemeNames = strings.getColorSchemes() as unknown as Record<string, Property<string>>;
    const labelNames = strings.getLabelModes() as unknown as Record<string, Property<string>>;
    const inner = options.width - 24;
    const column = (inner - 8) / 2;
    const disposers: (() => void)[] = [];
    const ownedProperties: { dispose(): void }[] = [];

    // ── Structure: collection combo + one structure combo per collection ───────
    const groups = libraryGroups(model.options.category);
    const initialGroup = libraryEntry(model.entryIdProperty.value)?.group ?? groups[0] ?? "basics";
    const groupProperty = new Property<LibraryGroupValue>(initialGroup);
    const customChoice = (value: string): ComboChoice<string> => ({ value, label: controls.customStringProperty });
    const groupCombos = groups.map((group) => {
      const entries = model.entries.filter((e) => e.group === group);
      // Each combo owns a Property whose value is always one of its items.
      const local = new Property<string>(
        entries.some((e) => e.id === model.entryIdProperty.value) ? model.entryIdProperty.value : CUSTOM_ENTRY_ID,
      );
      local.lazyLink((id) => {
        if (id !== CUSTOM_ENTRY_ID && id !== model.entryIdProperty.value) {
          model.loadEntry(id).catch(() => undefined);
        }
      });
      const choices: ComboChoice<string>[] = [
        ...entries.map((e) => ({
          value: e.id,
          label: names[`${e.nameKey}StringProperty`] ?? controls.customStringProperty,
        })),
        customChoice(CUSTOM_ENTRY_ID),
      ];
      const combo = comboBox(local, choices, listParent, a11y.structureSelectorStringProperty, inner);
      return { group, local, combo, ids: new Set(entries.map((e) => e.id)) };
    });
    const syncCombos = (id: string) => {
      for (const g of groupCombos) {
        g.local.value = g.ids.has(id) ? id : CUSTOM_ENTRY_ID;
      }
      const entry = libraryEntry(id);
      if (entry && groups.includes(entry.group)) {
        groupProperty.value = entry.group;
      }
    };
    model.entryIdProperty.link(syncCombos);
    disposers.push(() => model.entryIdProperty.unlink(syncCombos));
    const updateGroupVisibility = (group: LibraryGroupValue) => {
      for (const g of groupCombos) {
        g.combo.visible = g.group === group;
      }
    };
    groupProperty.link(updateGroupVisibility);
    // Choosing a collection loads its first structure.
    groupProperty.lazyLink((group) => {
      const current = libraryEntry(model.entryIdProperty.value);
      if (current?.group !== group) {
        const first = model.entries.find((e) => e.group === group);
        if (first) {
          model.loadEntry(first.id).catch(() => undefined);
        }
      }
    });
    const structureChildren: Node[] = [];
    if (groups.length > 1) {
      const groupCombo = comboBox(
        groupProperty,
        groups.map((g) => ({ value: g, label: groupNames[`${g}StringProperty`] ?? controls.collectionStringProperty })),
        listParent,
        a11y.groupSelectorStringProperty,
        inner,
      );
      structureChildren.push(labeled(controls.collectionStringProperty, groupCombo, inner));
    }
    structureChildren.push(
      labeled(controls.structureStringProperty, new Node({ children: groupCombos.map((g) => g.combo) }), inner),
      pushButton(controls.openFileStringProperty, options.openFile, a11y.openFileStringProperty),
    );

    // ── Rendering ───────────────────────────────────────────────────────────────
    const styleProperty = new Property<DisplayStyleValue>(model.styleProperty.value);
    const styleCombo = comboBox(
      styleProperty,
      options.styles.map((s) => ({
        value: s,
        label: styleNames[`${s}StringProperty`] ?? controls.styleStringProperty,
      })),
      listParent,
      a11y.styleSelectorStringProperty,
      inner,
    );
    // The model's style can be one the menu lacks (set by script); keep the menu valid.
    const fromModelStyle = (s: DisplayStyleValue) => {
      if (options.styles.includes(s)) {
        styleProperty.value = s;
      }
    };
    model.styleProperty.link(fromModelStyle);
    styleProperty.lazyLink((s) => {
      if (s !== model.styleProperty.value) {
        model.setStyle(s);
      }
    });
    disposers.push(() => model.styleProperty.unlink(fromModelStyle));

    const schemeProperty = new Property<ColorSchemeValue>(model.colorSchemeProperty.value);
    const schemeCombo = comboBox(
      schemeProperty,
      options.colorSchemes.map((s) => ({
        value: s,
        label: schemeNames[`${s}StringProperty`] ?? controls.colorStringProperty,
      })),
      listParent,
      a11y.colorSelectorStringProperty,
      inner,
    );
    const fromModelScheme = (s: ColorSchemeValue) => {
      if (options.colorSchemes.includes(s)) {
        schemeProperty.value = s;
      }
    };
    model.colorSchemeProperty.link(fromModelScheme);
    schemeProperty.lazyLink((s) => {
      if (s !== model.colorSchemeProperty.value) {
        model.setColorScheme(s);
      }
    });
    disposers.push(() => model.colorSchemeProperty.unlink(fromModelScheme));

    const labelModes: LabelModeValue[] = options.showBiomoleculeOptions
      ? Object.values(LabelMode)
      : Object.values(LabelMode).filter((m) => m !== LabelMode.RESIDUE);
    const labelCombo = comboBox(
      model.labelModeProperty,
      labelModes.map((m) => ({ value: m, label: labelNames[`${m}StringProperty`] ?? controls.labelsStringProperty })),
      listParent,
      a11y.labelSelectorStringProperty,
      inner,
    );
    // The menus only act when their value changes; this re-applies them to a new selection.
    const applyButton = pushButton(controls.applyToSelectionStringProperty, () =>
      model.applyToSelection(styleProperty.value, schemeProperty.value, model.labelModeProperty.value),
    );

    // ── Display toggles ─────────────────────────────────────────────────────────
    const hydrogenBondNoteProperty = new PatternStringProperty(info.hydrogenBondsEstimateStringProperty, {
      min: HBOND_MIN_DISTANCE,
      max: HBOND_MAX_DISTANCE,
    });
    const toggles: Node[] = [
      pairRow(
        checkbox(model.showHydrogensProperty, controls.hydrogensStringProperty, column - 24),
        checkbox(model.spinProperty, controls.spinStringProperty, column - 24),
        column,
      ),
      pairRow(
        checkbox(model.perspectiveProperty, controls.perspectiveStringProperty, column - 24),
        checkbox(model.axesProperty, controls.axesStringProperty, column - 24),
        column,
      ),
    ];
    if (options.showCrystalOptions) {
      const customPackingProperty = new DerivedProperty([model.structureProperty], (structure) => {
        if (!structure) {
          return false;
        }
        const [a, b, c] = structure.cellRange;
        return !(a === b && b === c && a >= 1 && a <= 3);
      });
      const packingLabelProperty = new DerivedProperty(
        [model.structureProperty, controls.customCellsStringProperty],
        (structure, pattern) => {
          const [a, b, c] = structure?.cellRange ?? [1, 1, 1];
          return StringUtils.fillIn(pattern, { a, b, c });
        },
      );
      const cellRadio = new AquaRadioButtonGroup(
        model.cellRangeProperty,
        [
          ...[1, 2, 3].map((n) => ({
            value: n,
            createNode: () => label(new Property(`${n}×${n}×${n}`), inner - 30),
            options: { accessibleName: `${n}×${n}×${n}` },
          })),
          {
            value: 0,
            createNode: () => label(packingLabelProperty, inner - 30),
            options: { accessibleName: packingLabelProperty, visibleProperty: customPackingProperty },
          },
        ],
        {
          spacing: 4,
          radioButtonOptions: { radius: 6, selectedColor: MolScopeColors.accentColorProperty },
          accessibleName: controls.cellsStringProperty,
        },
      );
      ownedProperties.push(customPackingProperty, packingLabelProperty);
      toggles.push(
        pairRow(
          checkbox(model.unitCellProperty, controls.unitCellStringProperty, column - 24),
          checkbox(model.polyhedraProperty, controls.polyhedraStringProperty, column - 24),
          column,
        ),
        new VBox({
          align: "left",
          spacing: 4,
          children: [label(controls.cellsStringProperty, 60), cellRadio],
        }),
      );
    } else {
      toggles.push(
        checkbox(model.hydrogenBondsProperty, controls.hydrogenBondsStringProperty, inner - 24),
        new RichText(hydrogenBondNoteProperty, {
          font: SMALL_FONT,
          fill: MolScopeColors.mutedTextColorProperty,
          lineWrap: inner,
          visibleProperty: model.hydrogenBondsProperty,
        }),
      );
    }

    // ── Frames and vibration (only when the structure has them) ────────────────
    const frameNumberProperty = new NumberProperty(1);
    const frameCountProperty = new NumberProperty(1);
    const syncFrame = () => {
      frameCountProperty.value = Math.max(1, model.frameCount);
      frameNumberProperty.value = model.frameIndexProperty.value + 1;
    };
    const frameMultilink = Multilink.multilink([model.frameIndexProperty, model.structureProperty], syncFrame);
    const frameText = new PatternStringProperty(controls.frameStringProperty, {
      n: frameNumberProperty,
      count: frameCountProperty,
    });
    const arrowOptions = {
      ...FLAT_RECTANGULAR_BUTTON_OPTIONS,
      arrowWidth: 10,
      arrowHeight: 10,
      xMargin: 4,
      yMargin: 4,
    };
    const previousButton = new ArrowButton("left", () => model.setFrame("prev"), {
      ...arrowOptions,
      accessibleName: controls.previousFrameStringProperty,
    });
    const nextButton = new ArrowButton("right", () => model.setFrame("next"), {
      ...arrowOptions,
      accessibleName: controls.nextFrameStringProperty,
    });
    const frameRow = new HBox({
      spacing: 6,
      children: [
        previousButton,
        new Text(frameText, { font: CONTROL_FONT, fill: MolScopeColors.textColorProperty, maxWidth: 110 }),
        nextButton,
      ],
    });
    const animateCheckbox = checkbox(model.animatingProperty, controls.animateStringProperty, column - 24);
    const vibrateCheckbox = checkbox(model.vibrationProperty, controls.vibrateStringProperty, column - 24);
    const hasFramesProperty = new DerivedProperty([model.structureProperty], (s) => (s?.frames.length ?? 0) > 1);
    const hasVibrationsProperty = new DerivedProperty([model.structureProperty], (s) =>
      (s?.frames ?? []).some((f) => f.vibrations !== null),
    );
    const animationBox = new VBox({
      align: "left",
      spacing: 6,
      children: [frameRow, pairRow(animateCheckbox, vibrateCheckbox, column)],
    });
    const visibilityLink = Multilink.multilink([hasFramesProperty, hasVibrationsProperty], (frames, vibrations) => {
      animateCheckbox.visible = frames;
      vibrateCheckbox.visible = vibrations;
      animationBox.visible = frames || vibrations;
      frameRow.visible = frames;
    });

    const resetViewButton = pushButton(controls.resetViewStringProperty, () => model.resetView());

    const separator = () => new HSeparator({ stroke: MolScopeColors.panelBorderColorProperty });
    const content = new VBox({
      align: "left",
      spacing: 8,
      stretch: true,
      children: [
        heading(controls.structureStringProperty, inner),
        ...structureChildren,
        separator(),
        labeled(controls.styleStringProperty, styleCombo, inner),
        labeled(controls.colorStringProperty, schemeCombo, inner),
        labeled(controls.labelsStringProperty, labelCombo, inner),
        applyButton,
        separator(),
        ...toggles,
        animationBox,
        resetViewButton,
      ],
    });
    super(content, { minWidth: options.width, maxWidth: options.width });

    this.disposeViewerControlPanel = () => {
      for (const dispose of disposers) {
        dispose();
      }
      frameMultilink.dispose();
      visibilityLink.dispose();
      frameText.dispose();
      hydrogenBondNoteProperty.dispose();
      hasFramesProperty.dispose();
      hasVibrationsProperty.dispose();
      disposeSubtree(content);
      for (const property of ownedProperties) {
        property.dispose();
      }
      for (const g of groupCombos) {
        g.local.dispose();
      }
      groupProperty.dispose();
      styleProperty.dispose();
      schemeProperty.dispose();
      frameNumberProperty.dispose();
      frameCountProperty.dispose();
    };
  }

  public override dispose(): void {
    super.dispose();
    this.disposeViewerControlPanel();
  }
}
