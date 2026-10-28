/**
 * MolScopeHotkeyData.ts
 *
 * Key bindings for the focused molecule viewer. Each is HotkeyData, read both by
 * the KeyboardListener that handles it and by the keyboard-help row that documents
 * it, so the two cannot drift apart.
 */

import { HotkeyData } from "scenerystack/scenery";
import { StringManager } from "../i18n/StringManager.js";

const REPO_NAME = "mol-scope";
const keyboardHelp = StringManager.getInstance().getKeyboardHelp();

const MolScopeHotkeyData = {
  ROTATE: new HotkeyData({
    keys: ["arrowLeft", "arrowRight", "arrowUp", "arrowDown"],
    repoName: REPO_NAME,
    keyboardHelpDialogLabelStringProperty: keyboardHelp.rotateStringProperty,
  }),
  ROLL: new HotkeyData({
    keys: ["shift+arrowLeft", "shift+arrowRight"],
    repoName: REPO_NAME,
    keyboardHelpDialogLabelStringProperty: keyboardHelp.rollStringProperty,
  }),
  ZOOM_IN: new HotkeyData({
    keys: ["equals", "plus"],
    repoName: REPO_NAME,
    keyboardHelpDialogLabelStringProperty: keyboardHelp.zoomInStringProperty,
  }),
  ZOOM_OUT: new HotkeyData({
    keys: ["minus"],
    repoName: REPO_NAME,
    keyboardHelpDialogLabelStringProperty: keyboardHelp.zoomOutStringProperty,
  }),
  RESET_VIEW: new HotkeyData({
    keys: ["home"],
    repoName: REPO_NAME,
    keyboardHelpDialogLabelStringProperty: keyboardHelp.resetViewStringProperty,
  }),
  NEXT_ATOM: new HotkeyData({
    keys: ["n"],
    repoName: REPO_NAME,
    keyboardHelpDialogLabelStringProperty: keyboardHelp.nextAtomStringProperty,
  }),
  PREVIOUS_ATOM: new HotkeyData({
    keys: ["p"],
    repoName: REPO_NAME,
    keyboardHelpDialogLabelStringProperty: keyboardHelp.previousAtomStringProperty,
  }),
  PICK_ATOM: new HotkeyData({
    keys: ["enter", "space"],
    repoName: REPO_NAME,
    keyboardHelpDialogLabelStringProperty: keyboardHelp.pickAtomStringProperty,
  }),
} as const;

export default MolScopeHotkeyData;
