/**
 * CrystalsKeyboardHelpContent.ts
 *
 * Keyboard-help dialog for the Crystals screen: the viewer's own keys on the left;
 * combo boxes and basic navigation (with checkboxes) on the right.
 */

import {
  BasicActionsKeyboardHelpSection,
  ComboBoxKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";
import { createViewerKeyboardHelpSection } from "../../common/view/MolScopeKeyboardHelpSections.js";

export class CrystalsKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super(
      [createViewerKeyboardHelpSection()],
      [new ComboBoxKeyboardHelpSection(), new BasicActionsKeyboardHelpSection({ withCheckboxContent: true })],
    );
  }
}
