/**
 * StructureInfoPanel.ts
 *
 * The left-hand panel: what is loaded (title, formula, molar mass, counts, cell
 * parameters), the mouse mode with a one-line hint, the identified atom, and the
 * measurement list. Everything is rebuilt from model Properties, so script
 * commands and clicks update it the same way.
 */

import { Multilink, type Property } from "scenerystack/axon";
import { toFixed } from "scenerystack/dot";
import { StringUtils } from "scenerystack/phetcommon";
import { HSeparator, RichText, Text, VBox } from "scenerystack/scenery";
import { StringManager } from "../../i18n/StringManager.js";
import MolScopeColors from "../../MolScopeColors.js";
import { MolScopePanel } from "../MolScopePanel.js";
import { hillFormula, molarMass } from "../model/Composition.js";
import { PickingMode, type PickingModeValue } from "../model/ScriptEngine.js";
import { LoadState, type ViewerModel } from "../model/ViewerModel.js";
import { CONTROL_FONT, heading, pushButton, radioGroup, SMALL_FONT } from "./ControlFactory.js";
import { disposeSubtree } from "./disposeSubtree.js";
import { formatAtomDescription, formatMeasurement, formatPosition, structureDisplayName } from "./formatters.js";

/** Measurements listed before older ones scroll off. */
const MAX_LISTED_MEASUREMENTS = 5;

const NEEDED_PICKS: Partial<Record<PickingModeValue, number>> = { distance: 2, angle: 3, torsion: 4 };

export class StructureInfoPanel extends MolScopePanel {
  private readonly disposeStructureInfoPanel: () => void;

  public constructor(model: ViewerModel, width: number, modes: readonly PickingModeValue[]) {
    const strings = StringManager.getInstance();
    const info = strings.getInfo();
    const controls = strings.getControls();
    const hints = strings.getHints() as unknown as Record<string, Property<string>>;
    const modeNames = strings.getPickingModes() as unknown as Record<string, Property<string>>;
    const inner = width - 24;

    const titleText = new RichText("", {
      font: heading(controls.structureStringProperty, inner).font,
      fill: MolScopeColors.textColorProperty,
      lineWrap: inner,
      maxHeight: 80,
    });
    const detailsText = new RichText("", {
      font: CONTROL_FONT,
      fill: MolScopeColors.textColorProperty,
      lineWrap: inner,
      leading: 3,
    });
    const statusText = new Text("", { font: SMALL_FONT, fill: MolScopeColors.mutedTextColorProperty, maxWidth: inner });

    const modeGroup = radioGroup(
      model.pickingModeProperty,
      modes.map((m) => ({ value: m, label: modeNames[`${m}StringProperty`] ?? controls.mouseStringProperty })),
      strings.getCommonA11yStrings().pickingModeStringProperty,
      inner - 20,
    );
    const hintText = new RichText("", {
      font: SMALL_FONT,
      fill: MolScopeColors.mutedTextColorProperty,
      lineWrap: inner,
    });
    const pickText = new RichText("", { font: SMALL_FONT, fill: MolScopeColors.textColorProperty, lineWrap: inner });
    const measurementText = new RichText("", {
      font: SMALL_FONT,
      fill: MolScopeColors.measurementColorProperty,
      lineWrap: inner,
      leading: 2,
    });
    const clearButton = pushButton(controls.clearMeasurementsStringProperty, () => model.clearMeasurements());

    const updateSummary = () => {
      const structure = model.structure;
      const state = model.displayState;
      const loading = model.loadStateProperty.value === LoadState.LOADING;
      const error = model.loadStateProperty.value === LoadState.ERROR;
      statusText.string = loading
        ? info.loadingStringProperty.value
        : error
          ? StringUtils.fillIn(info.loadErrorStringProperty.value, { reason: model.loadErrorProperty.value })
          : "";
      statusText.visible = loading || error;
      if (!(structure && state)) {
        titleText.string = info.noStructureStringProperty.value;
        detailsText.string = "";
        return;
      }
      titleText.string = escapeHtml(structureDisplayName(model));
      const formula = hillFormula(structure)
        .map((t) => (t.count === 1 ? t.symbol : `${t.symbol}<sub>${t.count}</sub>`))
        .join("");
      const lines: string[] = [];
      if (!(structure.isBiomolecule || structure.unitCell)) {
        lines.push(formula);
        lines.push(StringUtils.fillIn(info.molarMassStringProperty.value, { value: toFixed(molarMass(structure), 2) }));
      }
      lines.push(
        StringUtils.fillIn(info.atomsBondsStringProperty.value, {
          atoms: structure.atoms.length,
          bonds: structure.bonds.length,
        }),
      );
      if (structure.isBiomolecule) {
        lines.push(
          StringUtils.fillIn(info.residuesChainsStringProperty.value, {
            residues: structure.residues.filter((r) => r.leadAtom >= 0).length,
            chains: new Set(structure.atoms.map((a) => a.chain)).size,
          }),
        );
      }
      const cell = structure.unitCell;
      if (cell && structure.format === "CIF") {
        const p = cell.parameters;
        lines.push(
          StringUtils.fillIn(info.cellStringProperty.value, {
            a: toFixed(p.a, 3),
            b: toFixed(p.b, 3),
            c: toFixed(p.c, 3),
          }),
          StringUtils.fillIn(info.cellAnglesStringProperty.value, {
            alpha: toFixed(p.alpha, 1),
            beta: toFixed(p.beta, 1),
            gamma: toFixed(p.gamma, 1),
          }),
        );
        if (cell.spaceGroup) {
          lines.push(StringUtils.fillIn(info.spaceGroupStringProperty.value, { name: escapeHtml(cell.spaceGroup) }));
        }
      }
      // Trajectories and vibration files name each frame (e.g. "Water: bend, 1595 cm^-1").
      const comment = model.currentFrame?.comment ?? "";
      if (structure.frames.length > 1 && comment) {
        lines.push(`<i>${escapeHtml(comment.replace(/\^-1/g, "⁻¹"))}</i>`);
      }
      const selected = state.selectedCount();
      if (selected !== state.atomCount) {
        lines.push(StringUtils.fillIn(info.selectedStringProperty.value, { count: selected }));
      }
      detailsText.string = lines.join("<br>");
    };

    const updatePicking = () => {
      const mode = model.pickingModeProperty.value;
      hintText.string = escapeHtml(hints[`${mode}StringProperty`]?.value ?? "");
      const structure = model.structure;
      const needed = NEEDED_PICKS[mode];
      const pending = model.pendingPicksProperty.value;
      const picked = model.pickedAtomProperty.value;
      const lines: string[] = [];
      if (needed && pending.length > 0) {
        lines.push(StringUtils.fillIn(info.picksStringProperty.value, { count: pending.length, needed }));
      }
      if (structure && picked !== null && mode !== PickingMode.ROTATE) {
        lines.push(escapeHtml(formatAtomDescription(structure, picked)));
        lines.push(formatPosition(model.currentPositions(), picked));
      }
      pickText.string = lines.join("<br>");
      pickText.visible = lines.length > 0;
      const measurements = model.measurementsProperty.value;
      const atoms = model.structure?.atoms ?? [];
      measurementText.string = measurements
        .slice(-MAX_LISTED_MEASUREMENTS)
        .map((m) => {
          const names = m.atoms.map((i) => atoms[i]?.name ?? "?").join("–");
          return `${escapeHtml(names)}: ${formatMeasurement(m.atoms.length, model.measurementValue(m))}`;
        })
        .join("<br>");
      measurementBox.visible = measurements.length > 0;
    };

    const measurementBox = new VBox({
      align: "left",
      spacing: 4,
      children: [heading(controls.measurementsStringProperty, inner), measurementText, clearButton],
    });

    const summaryMultilink = Multilink.multilinkAny(
      [
        model.structureProperty,
        model.entryIdProperty,
        model.displayRevisionProperty,
        model.loadStateProperty,
        model.loadErrorProperty,
        model.frameIndexProperty,
        info.atomsBondsStringProperty,
      ],
      updateSummary,
    );
    const pickingMultilink = Multilink.multilinkAny(
      [
        model.pickingModeProperty,
        model.pendingPicksProperty,
        model.pickedAtomProperty,
        model.measurementsProperty,
        model.structureProperty,
        model.frameIndexProperty,
      ],
      updatePicking,
    );

    const content = new VBox({
      align: "left",
      spacing: 8,
      stretch: true,
      children: [
        titleText,
        statusText,
        detailsText,
        new HSeparator({ stroke: MolScopeColors.panelBorderColorProperty }),
        heading(controls.mouseStringProperty, inner),
        modeGroup,
        hintText,
        pickText,
        measurementBox,
      ],
    });
    super(content, { minWidth: width, maxWidth: width });

    this.disposeStructureInfoPanel = () => {
      summaryMultilink.dispose();
      pickingMultilink.dispose();
      disposeSubtree(content);
    };
  }

  public override dispose(): void {
    super.dispose();
    this.disposeStructureInfoPanel();
  }
}

/** RichText interprets markup; structure titles and atom names come from files. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
