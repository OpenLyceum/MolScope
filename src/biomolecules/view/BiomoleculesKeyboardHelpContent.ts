/**
 * BiomoleculesKeyboardHelpContent.ts
 *
 * Keyboard-help dialog for the Biomolecules screen: the viewer's own keys on the left;
 * combo boxes and basic navigation (with checkboxes) on the right.
 */

import {
  BasicActionsKeyboardHelpSection,
  ComboBoxKeyboardHelpSection,
  TwoColumnKeyboardHelpContent,
} from "scenerystack/scenery-phet";
import { createViewerKeyboardHelpSection } from "../../common/view/MolScopeKeyboardHelpSections.js";

export class BiomoleculesKeyboardHelpContent extends TwoColumnKeyboardHelpContent {
  public constructor() {
    super(
      [createViewerKeyboardHelpSection()],
      [new ComboBoxKeyboardHelpSection(), new BasicActionsKeyboardHelpSection({ withCheckboxContent: true })],
    );
  }
}
