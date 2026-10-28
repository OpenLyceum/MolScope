/**
 * FileOpener.ts
 *
 * Getting structure files into the viewer: an Open File dialog (a transient
 * <input type="file">) and drag-and-drop of files onto the page, as Jmol's applet
 * supports. Drops go to whichever screen is currently visible.
 */

import { ACCEPTED_EXTENSIONS } from "../model/parsers/parseStructure.js";

export type FileHandler = (text: string, fileName: string) => void;

/** Shows the browser's file picker and hands the chosen file's text to `handler`. */
export function openFileDialog(handler: FileHandler): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ACCEPTED_EXTENSIONS.join(",");
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) {
      file
        .text()
        .then((text) => handler(text, file.name))
        .catch(() => undefined);
    }
  });
  input.click();
}

/**
 * Accepts files dropped anywhere on the page while `isActive()` is true.
 * Returns a function that removes the listeners.
 */
export function installDropTarget(isActive: () => boolean, handler: FileHandler): () => void {
  const onDragOver = (event: DragEvent) => {
    if (isActive() && event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (event: DragEvent) => {
    const file = event.dataTransfer?.files[0];
    if (!(isActive() && file)) {
      return;
    }
    event.preventDefault();
    file
      .text()
      .then((text) => handler(text, file.name))
      .catch(() => undefined);
  };
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("drop", onDrop);
  return () => {
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("drop", onDrop);
  };
}
