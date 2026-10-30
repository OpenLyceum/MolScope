/**
 * MoleculeViewerNode.ts
 *
 * The interactive 3D viewport. A CanvasNode paints the structure through
 * {@link MoleculeRenderer}; a transparent hit rectangle on top takes the input:
 *
 *   drag            rotate (trackball about the screen x/y axes)
 *   shift-drag      zoom (vertical) and roll about the view axis (horizontal)
 *   ctrl/alt-drag   translate
 *   wheel           zoom
 *   hover           tooltip naming the atom under the pointer
 *   click           pick the atom (identify / measure / select / centre, per mouse mode)
 *
 * The node is focusable: arrow keys rotate, +/− zoom, Home resets, N/P walk a
 * keyboard cursor through the displayed atoms and Enter/Space picks it — so every
 * measurement can be made without a pointer.
 */

import { DerivedProperty, Multilink, PatternStringProperty, type TReadOnlyProperty } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { Vector2 } from "scenerystack/dot";
import {
  CanvasNode,
  type Color,
  KeyboardListener,
  Node,
  type NodeOptions,
  type PressListenerEvent,
  Rectangle,
  RichText,
  type SceneryEvent,
  type TInputListener,
} from "scenerystack/scenery";
import { PhetFont } from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import MolScopeColors from "../../MolScopeColors.js";
import MolScopeHotkeyData from "../MolScopeHotkeyData.js";
import type { PolymerPath } from "../model/CartoonGeometry.js";
import { buildPolymerPaths } from "../model/CartoonGeometry.js";
import type { Structure } from "../model/Structure.js";
import type { Measurement, ViewerModel } from "../model/ViewerModel.js";
import { disposeSubtree } from "./disposeSubtree.js";
import { formatAtomDescription, formatMeasurement } from "./formatters.js";
import { MoleculeRenderer, type OverlayColors } from "./MoleculeRenderer.js";

/** Degrees of rotation per pixel of drag. */
const DEGREES_PER_PIXEL = 0.5;
/** Degrees per arrow-key press. */
const KEY_ROTATION = 10;
/** Pixels of movement below which a press-release counts as a click. */
const CLICK_SLOP = 4;
/** Zoom factor per wheel notch / key press. */
const ZOOM_STEP = 1.15;
const LABEL_FONT = new PhetFont(12);
const TOOLTIP_FONT = new PhetFont(12);

class MoleculeCanvasNode extends CanvasNode {
  public readonly moleculeRenderer = new MoleculeRenderer();
  private readonly model: ViewerModel;
  private paths: PolymerPath[] = [];
  private pathsFor: { structure: Structure | null; frame: number } = { structure: null, frame: -1 };
  private readonly colorProperties: Record<keyof OverlayColors, TReadOnlyProperty<Color>>;

  public constructor(model: ViewerModel, bounds: Bounds2) {
    super({ canvasBounds: bounds, pickable: false });
    this.model = model;
    this.colorProperties = {
      label: MolScopeColors.labelColorProperty,
      measurement: MolScopeColors.measurementColorProperty,
      unitCell: MolScopeColors.unitCellColorProperty,
      halo: MolScopeColors.selectionHaloColorProperty,
      hover: MolScopeColors.hoverColorProperty,
      pick: MolScopeColors.pickColorProperty,
      hydrogenBond: MolScopeColors.hydrogenBondColorProperty,
      axisX: MolScopeColors.axisXColorProperty,
      axisY: MolScopeColors.axisYColorProperty,
      axisZ: MolScopeColors.axisZColorProperty,
    };
  }

  public paintCanvas(ctx: CanvasRenderingContext2D): void {
    const model = this.model;
    const state = model.displayState;
    const structure = model.structure;
    if (!(state && structure)) {
      return;
    }
    const bounds = this.canvasBounds;
    const positions = model.currentPositions();
    const frame = model.frameIndexProperty.value;
    const needsPaths = structure.isBiomolecule;
    if (needsPaths && (this.pathsFor.structure !== structure || this.pathsFor.frame !== frame)) {
      this.paths = buildPolymerPaths(structure, model.currentFrame?.positions ?? positions);
      this.pathsFor = { structure, frame };
    } else if (!needsPaths) {
      this.paths = [];
    }
    const colors = Object.fromEntries(
      Object.entries(this.colorProperties).map(([key, property]) => [key, property.value.toCSS()]),
    ) as unknown as OverlayColors;
    const range = model.cellRangeProperty.value;
    const axisLabels = StringManager.getInstance().getAxisLabels();
    ctx.save();
    ctx.translate(bounds.minX, bounds.minY);
    this.moleculeRenderer.render(ctx, {
      width: bounds.width,
      height: bounds.height,
      state,
      positions,
      rotation: model.rotationProperty.value,
      center: model.centerProperty.value,
      radius: model.radiusProperty.value,
      zoom: model.zoomProperty.value,
      perspective: model.perspectiveProperty.value,
      background: model.backgroundOverrideProperty.value,
      paths: this.paths,
      hydrogenBonds: model.hydrogenBondsProperty.value ? model.hydrogenBonds() : null,
      polyhedra: model.polyhedraProperty.value ? model.polyhedra() : null,
      unitCell: model.unitCellProperty.value ? structure.unitCell : null,
      cellRange: structure.format === "CIF" ? [range, range, range] : [1, 1, 1],
      showAxes: model.axesProperty.value,
      showHalos: model.selectionHalosProperty.value,
      hovered: model.hoveredAtomProperty.value,
      picked: model.pickedAtomProperty.value,
      pendingPicks: model.pendingPicksProperty.value,
      measurements: model.measurementsProperty.value,
      measurementLabel: (m: Measurement) => formatMeasurement(m.atoms.length, model.measurementValue(m)),
      axisLabels: [
        axisLabels.xStringProperty.value,
        axisLabels.yStringProperty.value,
        axisLabels.zStringProperty.value,
      ],
      cellLabels: [
        axisLabels.originStringProperty.value,
        axisLabels.aStringProperty.value,
        axisLabels.bStringProperty.value,
        axisLabels.cStringProperty.value,
      ],
      colors,
      font: LABEL_FONT.toCSS(),
    });
    ctx.restore();
  }
}

export type MoleculeViewerNodeOptions = NodeOptions;

export class MoleculeViewerNode extends Node {
  private readonly model: ViewerModel;
  private readonly canvasNode: MoleculeCanvasNode;
  private readonly tooltip: Node;
  private readonly tooltipText: RichText;
  private readonly repaintMultilink: { dispose(): void };
  private readonly tooltipLink: () => void;
  private readonly structureLink: () => void;
  private readonly colorListener: () => void;
  private readonly currentAtomDescriptionProperty: TReadOnlyProperty<string> & { dispose(): void };
  private readonly currentAtomStringProperty: PatternStringProperty<{ description: TReadOnlyProperty<string> }>;

  private readonly keyboardListener: KeyboardListener<never[]>;

  /** Keyboard cursor through displayed atoms. */
  private atomCursor = -1;

  public constructor(model: ViewerModel, viewBounds: Bounds2, providedOptions?: MoleculeViewerNodeOptions) {
    const a11y = StringManager.getInstance().getCommonA11yStrings();
    super({
      tagName: "div",
      focusable: true,
      accessibleName: a11y.viewerStringProperty,
      accessibleHelpText: a11y.viewerHelpStringProperty,
      ...providedOptions,
    });
    this.model = model;

    const hitArea = new Rectangle(viewBounds, { fill: "rgba(0,0,0,0)", cursor: "grab" });
    this.canvasNode = new MoleculeCanvasNode(model, viewBounds);
    this.tooltipText = new RichText("", { font: TOOLTIP_FONT, fill: MolScopeColors.textColorProperty });
    const tooltipBackground = new Rectangle(0, 0, 1, 1, {
      fill: MolScopeColors.panelBackgroundColorProperty,
      stroke: MolScopeColors.panelBorderColorProperty,
      cornerRadius: 4,
      opacity: 0.92,
    });
    this.tooltip = new Node({ children: [tooltipBackground, this.tooltipText], visible: false, pickable: false });
    this.tooltipText.boundsProperty.link((b) => {
      tooltipBackground.setRect(b.minX - 5, b.minY - 3, b.width + 10, b.height + 6);
    });
    this.children = [this.canvasNode, hitArea, this.tooltip];

    // Repaint on anything the renderer reads.
    const invalidate = () => this.canvasNode.invalidatePaint();
    this.repaintMultilink = Multilink.multilinkAny(
      [
        model.structureProperty,
        model.displayRevisionProperty,
        model.rotationProperty,
        model.zoomProperty,
        model.centerProperty,
        model.radiusProperty,
        model.perspectiveProperty,
        model.backgroundOverrideProperty,
        model.hydrogenBondsProperty,
        model.polyhedraProperty,
        model.unitCellProperty,
        model.axesProperty,
        model.selectionHalosProperty,
        model.hoveredAtomProperty,
        model.pickedAtomProperty,
        model.pendingPicksProperty,
        model.measurementsProperty,
        model.frameIndexProperty,
        model.vibrationTimeProperty,
        model.vibrationProperty,
        model.cellRangeProperty,
      ],
      invalidate,
    );
    // Overlay colours change with the colour profile.
    this.colorListener = invalidate;
    MolScopeColors.labelColorProperty.lazyLink(this.colorListener);

    // Indices from the previous structure mean nothing in the new one.
    this.structureLink = () => {
      this.atomCursor = -1;
    };
    model.structureProperty.lazyLink(this.structureLink);

    this.tooltipLink = () => this.updateTooltip();
    model.hoveredAtomProperty.lazyLink(this.tooltipLink);
    model.rotationProperty.lazyLink(this.tooltipLink);

    this.currentAtomDescriptionProperty = new DerivedProperty(
      [model.hoveredAtomProperty, model.structureProperty],
      (index, structure) => (structure && index !== null ? formatAtomDescription(structure, index) : ""),
    );
    this.currentAtomStringProperty = new PatternStringProperty(a11y.currentAtomStringProperty, {
      description: this.currentAtomDescriptionProperty,
    });

    hitArea.addInputListener(this.createPointerListener(hitArea));
    this.keyboardListener = this.createKeyboardListener();
    this.addInputListener(this.keyboardListener);
  }

  /** Pixels per Å in the last painted frame (for tests and the scale bar). */
  public get pixelsPerAngstrom(): number {
    return this.canvasNode.moleculeRenderer.pixelsPerAngstrom;
  }

  private localPoint(event: SceneryEvent): Vector2 {
    const p = this.globalToLocalPoint(event.pointer.point);
    const b = this.canvasNode.canvasBounds;
    return new Vector2(p.x - b.minX, p.y - b.minY);
  }

  private createPointerListener(hitArea: Rectangle): TInputListener {
    const model = this.model;
    let pressed = false;
    let activePointer: SceneryEvent["pointer"] | null = null;
    let start = new Vector2(0, 0);
    let last = new Vector2(0, 0);
    let travelled = 0;
    let modifiers = { shift: false, ctrl: false };

    const dragListener: TInputListener = {
      move: (event) => {
        const p = this.localPoint(event);
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        last = p;
        travelled = Math.max(travelled, p.distance(start));
        if (travelled < CLICK_SLOP) {
          return;
        }
        if (modifiers.shift) {
          model.zoomBy(ZOOM_STEP ** (-dy / 20));
          model.rotate([0, 0, 1], -dx * DEGREES_PER_PIXEL);
        } else if (modifiers.ctrl) {
          const delta = this.canvasNode.moleculeRenderer.screenDeltaToModel(dx, dy, model.rotationProperty.value);
          const c = model.centerProperty.value;
          model.centerProperty.value = [c[0] - delta[0], c[1] - delta[1], c[2] - delta[2]];
        } else {
          model.rotationProperty.value = model.rotationProperty.value
            .rotatedAboutScreenAxis([0, 1, 0], dx * DEGREES_PER_PIXEL)
            .rotatedAboutScreenAxis([1, 0, 0], dy * DEGREES_PER_PIXEL);
        }
      },
      up: (event) => {
        release(event);
      },
      cancel: () => {
        release(null);
      },
      interrupt: () => {
        release(null);
      },
    };

    const release = (event: SceneryEvent | null) => {
      if (!pressed) {
        return;
      }
      pressed = false;
      hitArea.cursor = "grab";
      // Always detach: touch pointers are disposed after cancel/interrupt too.
      if (activePointer?.listeners.includes(dragListener)) {
        activePointer.removeInputListener(dragListener);
      }
      activePointer = null;
      if (event) {
        if (travelled < CLICK_SLOP) {
          const p = this.localPoint(event);
          const atom = this.canvasNode.moleculeRenderer.pick(p.x, p.y);
          if (atom !== null) {
            model.pickAtom(atom);
          }
        }
      }
    };

    return {
      down: (event: PressListenerEvent) => {
        if (pressed || !event.canStartPress()) {
          return;
        }
        pressed = true;
        start = this.localPoint(event);
        last = start;
        travelled = 0;
        const dom = event.domEvent as MouseEvent | null;
        modifiers = {
          shift: !!dom?.shiftKey,
          ctrl: !!(dom?.ctrlKey || dom?.altKey || dom?.metaKey),
        };
        hitArea.cursor = "grabbing";
        activePointer = event.pointer;
        event.pointer.addInputListener(dragListener, true);
        this.focus();
      },
      move: (event: SceneryEvent) => {
        if (pressed || event.pointer.isTouchLike()) {
          return;
        }
        const p = this.localPoint(event);
        model.hoveredAtomProperty.value = this.canvasNode.moleculeRenderer.pick(p.x, p.y);
      },
      exit: () => {
        if (!pressed) {
          model.hoveredAtomProperty.value = null;
        }
      },
      wheel: (event: SceneryEvent<WheelEvent>) => {
        const delta = event.domEvent?.deltaY ?? 0;
        model.zoomBy(delta < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
        event.handle();
      },
    };
  }

  private createKeyboardListener(): KeyboardListener<never[]> {
    const model = this.model;
    const keys = [
      ...MolScopeHotkeyData.ROTATE.keyStringProperties,
      ...MolScopeHotkeyData.ROLL.keyStringProperties,
      ...MolScopeHotkeyData.ZOOM_IN.keyStringProperties,
      ...MolScopeHotkeyData.ZOOM_OUT.keyStringProperties,
      ...MolScopeHotkeyData.RESET_VIEW.keyStringProperties,
      ...MolScopeHotkeyData.NEXT_ATOM.keyStringProperties,
      ...MolScopeHotkeyData.PREVIOUS_ATOM.keyStringProperties,
      ...MolScopeHotkeyData.PICK_ATOM.keyStringProperties,
    ];
    return new KeyboardListener({
      keyStringProperties: keys,
      fire: (_event, keysPressed) => {
        switch (keysPressed) {
          case "arrowLeft":
            model.rotate([0, 1, 0], -KEY_ROTATION);
            break;
          case "arrowRight":
            model.rotate([0, 1, 0], KEY_ROTATION);
            break;
          case "arrowUp":
            model.rotate([1, 0, 0], -KEY_ROTATION);
            break;
          case "arrowDown":
            model.rotate([1, 0, 0], KEY_ROTATION);
            break;
          case "shift+arrowLeft":
            model.rotate([0, 0, 1], KEY_ROTATION);
            break;
          case "shift+arrowRight":
            model.rotate([0, 0, 1], -KEY_ROTATION);
            break;
          case "equals":
          case "plus":
            model.zoomBy(ZOOM_STEP);
            break;
          case "minus":
            model.zoomBy(1 / ZOOM_STEP);
            break;
          case "home":
            model.resetView();
            break;
          case "n":
            this.moveCursor(1);
            break;
          case "p":
            this.moveCursor(-1);
            break;
          case "enter":
          case "space":
            if (this.atomCursor >= 0) {
              model.pickAtom(this.atomCursor);
            }
            break;
          default:
            break;
        }
      },
    });
  }

  /** Walks the keyboard cursor through displayed atoms and announces each one. */
  private moveCursor(direction: 1 | -1): void {
    const state = this.model.displayState;
    if (!state || state.atomCount === 0) {
      return;
    }
    const n = state.atomCount;
    let i = this.atomCursor;
    for (let k = 0; k < n; k++) {
      i = (((i + direction) % n) + n) % n;
      if (state.isDisplayed(i)) {
        break;
      }
    }
    this.atomCursor = i;
    this.model.hoveredAtomProperty.value = i;
    this.addAccessibleResponse(this.currentAtomStringProperty.value);
  }

  private updateTooltip(): void {
    const index = this.model.hoveredAtomProperty.value;
    const structure = this.model.structure;
    // Repaint first so the projection used to place the tooltip is current.
    const position = index === null ? null : this.canvasNode.moleculeRenderer.screenPosition(index);
    if (index === null || !structure || !position) {
      this.tooltip.visible = false;
      return;
    }
    this.tooltipText.string = formatAtomDescription(structure, index);
    const b = this.canvasNode.canvasBounds;
    const x = Math.min(b.maxX - this.tooltip.width - 4, b.minX + position.x + 14);
    const y = Math.max(b.minY + 4, b.minY + position.y - 30);
    this.tooltip.translation = new Vector2(x - this.tooltipText.left + 5, y - this.tooltipText.top + 3);
    this.tooltip.visible = true;
  }

  /** Hides the tooltip and keyboard cursor (Reset All). */
  public reset(): void {
    this.atomCursor = -1;
    this.tooltip.visible = false;
  }

  public override dispose(): void {
    this.repaintMultilink.dispose();
    MolScopeColors.labelColorProperty.unlink(this.colorListener);
    this.model.structureProperty.unlink(this.structureLink);
    this.model.hoveredAtomProperty.unlink(this.tooltipLink);
    this.model.rotationProperty.unlink(this.tooltipLink);
    this.currentAtomStringProperty.dispose();
    this.currentAtomDescriptionProperty.dispose();
    this.keyboardListener.dispose();
    super.dispose();
    disposeSubtree(this.tooltip);
    this.tooltip.dispose();
  }
}
