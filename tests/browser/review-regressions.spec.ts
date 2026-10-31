import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { Node, RichText } from "scenerystack/scenery";
import type { ScreenView } from "scenerystack/sim";
import type { ScriptMessage } from "../../src/common/model/ScriptEngine.js";
import type { ViewerModel } from "../../src/common/model/ViewerModel.js";

type SimulationWindow = {
  pendingRun?: Promise<readonly ScriptMessage[]>;
  phet: {
    joist: {
      sim: {
        selectedScreenProperty: { value: { model: ViewerModel; view: ScreenView } };
        display: { updateDisplay(): void };
      };
    };
  };
};

const read = (file: string) => readFileSync(join(process.cwd(), "src/common/model/library/data", file), "utf8");

async function ready(page: Page, screen = 1, locale = "en") {
  await page.goto(`/?screens=${screen}&ea&locale=${locale}`);
  await page.getByRole("textbox").waitFor();
  await page.waitForFunction(() => {
    const model = (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model;
    return model.structure !== null && model.loadStateProperty.value === "idle";
  });
}

async function run(page: Page, script: string) {
  await page.evaluate(async (text) => {
    await (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model.runScript(text);
  }, script);
}

async function openText(page: Page, name: string, text: string) {
  const file = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Open a structure file|Ouvrir.*fichier|Abrir.*archivo/ }).press("Enter");
  await (await file).setFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
}

test("vibration measurements and picked coordinates follow the displayed positions", async ({ page }) => {
  await ready(page);
  await run(page, "load water-vibrations; set picking angle");
  const before = await page.evaluate(() => {
    const screen = (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value;
    const model = screen.model;
    // Hold the clock while selecting exact phases; the normal step writes this same Property.
    model.step = () => {
      /* Exact phases are set below instead of advancing with wall time. */
    };
    model.vibrationTimeProperty.value = 0;
    model.pickAtom(1);
    model.pickAtom(0);
    model.pickAtom(2);
    return model.measurementValue(model.measurementsProperty.value[0]!);
  });
  expect(before).toBeCloseTo(104.5202, 3);
  for (const vibrating of [true, false]) {
    const result = await page.evaluate((on) => {
      const screen = (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value;
      screen.model.vibrationTimeProperty.value = 0.25;
      screen.model.vibrationProperty.value = on;
      const panel = screen.view.children.find((node) => node.constructor.name === "StructureInfoPanel")!;
      const strings: string[] = [];
      const visit = (node: Node) => {
        if (node.constructor.name === "RichText") {
          strings.push((node as RichText).string);
        }
        node.children.forEach(visit);
      };
      visit(panel);
      return { value: screen.model.measurementValue(screen.model.measurementsProperty.value[0]!), strings };
    }, vibrating);
    expect(result.value).toBeCloseTo(vibrating ? 103.7455 : 104.5202, 3);
    expect(result.strings).toContain(`H2–O1–H3: ${vibrating ? "103.7" : "104.5"}°`);
    // H3 x = -0.75695 - 0.09490 sin(2πt), rounded to the panel's three decimals.
    expect(result.strings.some((text) => text.includes(vibrating ? "(-0.852" : "(-0.757"))).toBe(true);
  }
});

test("keyboard picking skips hidden atoms and does nothing when all are hidden", async ({ page }) => {
  await ready(page);
  await run(page, "load water; hide all; set picking distance");
  const viewer = page.getByText("Molecule viewer", { exact: true });
  await viewer.focus();
  for (const key of ["n", "Enter", "p", "Space"]) {
    await page.keyboard.press(key);
  }
  const hidden = await page.evaluate(() => {
    const model = (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model;
    return {
      hover: model.hoveredAtomProperty.value,
      picked: model.pickedAtomProperty.value,
      pending: model.pendingPicksProperty.value,
    };
  });
  expect(hidden).toEqual({ hover: null, picked: null, pending: [] });
  await run(page, "display oxygen");
  await viewer.focus();
  await page.keyboard.press("n");
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model.pendingPicksProperty
          .value,
    ),
  ).toEqual([0]);
  await run(page, "hide oxygen");
  await viewer.focus();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model.pendingPicksProperty
          .value,
    ),
  ).toEqual([0]);
});

test("Reset All cancels a delayed console script, including later commands and output", async ({ page }) => {
  await ready(page);
  let seen!: () => void;
  let release!: (text: string) => Promise<void>;
  const request = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await page.route("https://pubchem.ncbi.nlm.nih.gov/**", (route) => {
    release = (body) =>
      route.fulfill({ status: 200, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body });
    seen();
  });
  await page.evaluate(() => {
    const state = window as unknown as SimulationWindow;
    const model = state.phet.joist.sim.selectedScreenProperty.value.model;
    const runScript = model.runScript.bind(model);
    model.runScript = (text) => {
      state.pendingRun = runScript(text);
      return state.pendingRun;
    };
  });
  const input = page.getByRole("textbox", { name: "Jmol script command", exact: true });
  await input.fill("load $water; color red; spin on");
  await input.press("Enter");
  await request;
  await page.getByRole("button", { name: "Reset All", exact: true }).press("Enter");
  await page.waitForFunction(
    () =>
      (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model.loadStateProperty
        .value === "idle",
  );
  await release(read("water.mol"));
  await page.evaluate(() => (window as unknown as SimulationWindow).pendingRun);
  const result = await page.evaluate(() => {
    const model = (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model;
    return {
      entry: model.entryIdProperty.value,
      spin: model.spinProperty.value,
      console: model.consoleLinesProperty.value,
      colors: [...model.displayState!.colors],
    };
  });
  expect(result.entry).toBe("caffeine");
  expect(result.spin).toBe(false);
  expect(result.console).toEqual([]);
  expect(new Set(result.colors).size).toBeGreaterThan(1);
});

test("packing controls and cell outline match asymmetric scripts and imported CIFs", async ({ page }) => {
  await ready(page, 3);
  await run(page, "load nacl {1 2 3}");
  await expect(page.getByRole("radio", { name: "Custom: 1×2×3", exact: true })).toBeChecked();
  const range = await page.evaluate(() => {
    const sim = (window as unknown as SimulationWindow).phet.joist.sim;
    sim.display.updateDisplay();
    const view = sim.selectedScreenProperty.value.view as unknown as {
      viewerNode: { canvasNode: { moleculeRenderer: { input: { cellRange: number[] } } } };
    };
    return view.viewerNode.canvasNode.moleculeRenderer.input.cellRange;
  });
  expect(range).toEqual([1, 2, 3]);
  await page.getByRole("radio", { name: "3×3×3", exact: true }).press("Space");
  await page.waitForFunction(
    () =>
      (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model.structure?.atoms
        .length === 343,
  );
  await openText(page, "halite.cif", read("cod-1000041.cif"));
  await expect(page.getByRole("radio", { name: "1×1×1", exact: true })).toBeChecked();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model.structure?.atoms
          .length,
    ),
  ).toBe(27);
  await page.getByRole("radio", { name: "2×2×2", exact: true }).press("Space");
  await page.waitForFunction(
    () =>
      (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model.structure?.atoms
        .length === 125,
  );
});

for (const { locale, mixed, invalid } of [
  { locale: "en", mixed: /records describe different molecules/, invalid: /missing or invalid coordinates/ },
  {
    locale: "fr",
    mixed: /enregistrements décrivent des molécules différentes/,
    invalid: /coordonnées ou des vecteurs de vibration/,
  },
  { locale: "es", mixed: /registros describen moléculas diferentes/, invalid: /coordenadas o vectores de vibración/ },
]) {
  test(`bad imports preserve the molecule and show translated errors in ${locale}`, async ({ page }) => {
    await ready(page, 1, locale);
    for (const { name, text, error } of [
      { name: "mixed.sdf", text: `${read("water.mol")}\n$$$$\n${read("carbon-dioxide.mol")}`, error: mixed },
      { name: "bad.xyz", text: "2\nbad\nH nope 0 0\nH 0 0 1\n", error: invalid },
    ]) {
      await openText(page, name, text);
      await expect(page.getByText(error)).toBeVisible();
      const state = await page.evaluate(() => {
        const model = (window as unknown as SimulationWindow).phet.joist.sim.selectedScreenProperty.value.model;
        return {
          entry: model.entryIdProperty.value,
          count: model.structure?.atoms.length,
          radiusFinite: Number.isFinite(model.radiusProperty.value),
        };
      });
      expect(state).toEqual({ entry: "caffeine", count: 24, radiusFinite: true });
    }
  });
}
