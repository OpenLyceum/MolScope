/**
 * ScriptConsoleNode.ts
 *
 * Jmol's script console, docked under the viewer: a text field (a real DOM
 * <input>, so typing, paste and IME work natively) with command history on the
 * up/down arrows, and the last few lines of output, errors in red.
 */

import { Multilink } from "scenerystack/axon";
import type { Bounds2 } from "scenerystack/dot";
import { DOM, HBox, RichText, VBox } from "scenerystack/scenery";
import { StringManager } from "../../i18n/StringManager.js";
import MolScopeColors from "../../MolScopeColors.js";
import { MolScopePanel } from "../MolScopePanel.js";
import type { ViewerModel } from "../model/ViewerModel.js";
import { CONTROL_FONT, heading, pushButton, SMALL_FONT } from "./ControlFactory.js";
import { disposeSubtree } from "./disposeSubtree.js";
import { formatScriptMessage } from "./formatters.js";

/** Output lines visible at once. */
const VISIBLE_LINES = 4;
/** Commands remembered for the up/down history. */
const HISTORY_SIZE = 50;

export class ScriptConsoleNode extends MolScopePanel {
  private readonly setValue: (value: string) => void;
  private readonly disposeScriptConsoleNode: () => void;

  public constructor(model: ViewerModel, bounds: Bounds2) {
    const strings = StringManager.getInstance();
    const controls = strings.getControls();
    const inner = bounds.width - 24;

    // The visible field. Scenery marks its rendered layers aria-hidden, so this element is for
    // pointer users only and stays out of the tab order. Keyboard and screen-reader users get the
    // parallel-DOM <input> on the same node; the two mirror each other's value.
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.tabIndex = -1;
    const inputNode = new DOM(input, {
      allowInput: true,
      tagName: "input",
      inputType: "text",
      accessibleName: strings.getCommonA11yStrings().consoleInputStringProperty,
    });
    // Scenery only writes inputValue to its element when it changes, so keep it current on every keystroke.
    const setValue = (value: string) => {
      input.value = value;
      inputNode.inputValue = value;
    };
    const history: string[] = [];
    let historyIndex = 0;

    const run = () => {
      const script = input.value.trim();
      if (script === "") {
        return;
      }
      history.push(script);
      if (history.length > HISTORY_SIZE) {
        history.shift();
      }
      historyIndex = history.length;
      setValue("");
      model.runScript(script).catch(() => undefined);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        run();
      } else if (event.key === "ArrowUp" && historyIndex > 0) {
        historyIndex--;
        setValue(history[historyIndex] ?? "");
        event.preventDefault();
      } else if (event.key === "ArrowDown") {
        historyIndex = Math.min(history.length, historyIndex + 1);
        setValue(history[historyIndex] ?? "");
        event.preventDefault();
      }
    };
    input.addEventListener("input", () => setValue(input.value));
    input.addEventListener("keydown", (event) => {
      // Keep keystrokes in the field away from the sim's global hotkeys.
      event.stopPropagation();
      handleKey(event);
    });
    input.addEventListener("keyup", (event) => event.stopPropagation());
    inputNode.addInputListener({
      input: (event) => {
        const target = event.domEvent?.target;
        if (target instanceof HTMLInputElement) {
          setValue(target.value);
        }
      },
      keydown: (event) => {
        if (event.domEvent) {
          handleKey(event.domEvent);
        }
      },
    });

    const runButton = pushButton(controls.runStringProperty, run);
    const inputWidth = inner - runButton.width - 70;

    const output = new RichText("", { font: SMALL_FONT, lineWrap: inner, leading: 2, maxHeight: 64 });

    const styleMultilink = Multilink.multilink(
      [
        MolScopeColors.controlSurfaceColorProperty,
        MolScopeColors.controlSurfaceTextColorProperty,
        MolScopeColors.panelBorderColorProperty,
        controls.consolePlaceholderStringProperty,
      ],
      (surface, text, border, placeholder) => {
        input.placeholder = placeholder;
        Object.assign(input.style, {
          width: `${inputWidth}px`,
          height: "22px",
          boxSizing: "border-box",
          font: `13px ${CONTROL_FONT.family}`,
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          padding: "2px 6px",
          border: `1px solid ${border.toCSS()}`,
          borderRadius: "4px",
          background: surface.toCSS(),
          color: text.toCSS(),
          outline: "none",
        });
        inputNode.invalidateDOM();
      },
    );

    const outputMultilink = Multilink.multilink(
      [
        model.consoleLinesProperty,
        MolScopeColors.consoleTextColorProperty,
        MolScopeColors.consoleInputColorProperty,
        MolScopeColors.consoleErrorColorProperty,
      ],
      (lines, textColor, inputColor, errorColor) => {
        output.string = lines
          .slice(-VISIBLE_LINES)
          .map((line) => {
            if (line.kind === "input") {
              return `<span style="color:${inputColor.toCSS()}">$ ${escapeHtml(line.text)}</span>`;
            }
            const color = line.message.isError ? errorColor : textColor;
            return `<span style="color:${color.toCSS()}">${escapeHtml(formatScriptMessage(line.message))}</span>`;
          })
          .join("<br>");
      },
    );

    const content = new VBox({
      align: "left",
      spacing: 4,
      children: [
        new HBox({ spacing: 8, children: [heading(controls.consoleStringProperty, 60), inputNode, runButton] }),
        output,
      ],
    });
    super(content, {
      minWidth: bounds.width,
      maxWidth: bounds.width,
      yMargin: 6,
      left: bounds.minX,
      top: bounds.minY,
    });
    this.setValue = setValue;

    this.disposeScriptConsoleNode = () => {
      styleMultilink.dispose();
      outputMultilink.dispose();
      disposeSubtree(content);
    };
  }

  /** Clears the typed text (Reset All). */
  public reset(): void {
    this.setValue("");
  }

  public override dispose(): void {
    super.dispose();
    this.disposeScriptConsoleNode();
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
