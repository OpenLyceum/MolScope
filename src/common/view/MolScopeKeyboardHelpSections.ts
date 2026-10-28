/**
 * MolScopeKeyboardHelpSections.ts
 *
 * The keyboard-help section for the focused molecule viewer. Rows are built from
 * {@link MolScopeHotkeyData}, so they always match the keys the listener handles.
 */

import {
  KeyboardHelpIconFactory,
  KeyboardHelpSection,
  KeyboardHelpSectionRow,
  TextKeyNode,
} from "scenerystack/scenery-phet";
import { StringManager } from "../../i18n/StringManager.js";
import MolScopeHotkeyData from "../MolScopeHotkeyData.js";

export const createViewerKeyboardHelpSection = (): KeyboardHelpSection =>
  new KeyboardHelpSection(StringManager.getInstance().getKeyboardHelp().viewerHeadingStringProperty, [
    KeyboardHelpSectionRow.fromHotkeyData(MolScopeHotkeyData.ROTATE, {
      icon: KeyboardHelpIconFactory.arrowKeysRowIcon(),
    }),
    KeyboardHelpSectionRow.fromHotkeyData(MolScopeHotkeyData.ROLL),
    // The stock icon map has no "=" key, so the zoom rows draw their own key caps.
    KeyboardHelpSectionRow.fromHotkeyData(MolScopeHotkeyData.ZOOM_IN, {
      icon: KeyboardHelpIconFactory.iconOrIcon(new TextKeyNode("+"), new TextKeyNode("=")),
    }),
    KeyboardHelpSectionRow.fromHotkeyData(MolScopeHotkeyData.ZOOM_OUT, { icon: new TextKeyNode("−") }),
    KeyboardHelpSectionRow.fromHotkeyData(MolScopeHotkeyData.RESET_VIEW),
    KeyboardHelpSectionRow.fromHotkeyData(MolScopeHotkeyData.NEXT_ATOM),
    KeyboardHelpSectionRow.fromHotkeyData(MolScopeHotkeyData.PREVIOUS_ATOM),
    KeyboardHelpSectionRow.fromHotkeyData(MolScopeHotkeyData.PICK_ATOM, {
      icon: KeyboardHelpIconFactory.spaceOrEnter(),
    }),
  ]);
