import {expect, test} from "@playwright/test";
import {openDemoSession} from "../../lib/demo-session";

/**
 * <Demo name>, shot <N>: <what this shot shows, in one line>.
 *
 * Needs: <app state this shot starts from, e.g. "the dev server on :3000, and no tasks yet">.
 * Changes: <what it leaves behind, and how to reset it before a retake>.
 */
const NAME = "<demo>/<NN-shot>"; // this file's path under demos/shots, without .spec.ts
const APP = process.env.DEMO_APP_URL ?? "http://localhost:3000";

test("<demo> shot <N>", async () => {
  const {page, demo, finish} = await openDemoSession(NAME, test.info());
  // finally: a failed check still saves the footage, which matters for steps you can't redo.
  try {
    await page.goto(APP);
    const main = page.getByRole("main");
    await expect(page.getByRole("heading", {level: 1})).toBeVisible({timeout: 60_000});
    // Bounded: pages with polling or live connections never go network-idle.
    await page.waitForLoadState("networkidle", {timeout: 10_000}).catch(() => undefined);
    demo.markStart();
    await demo.restoreCursor();
    await demo.pause(600);

    // One narration line per step, started as the step begins, so speech matches the screen. Actions
    // run while a line plays; waitForSpeech() only before the screen changes away from it.
    await demo.narrate("intro");
    await demo.hover(page.getByRole("heading", {level: 1}), 1500);
    await demo.waitForSpeech();

    await demo.narrate("add");
    await demo.type(main.getByRole("textbox", {name: "New task"}), "Water the ferns");
    await demo.click(main.getByRole("button", {name: "Add", exact: true}));
    await expect(main.getByText("Water the ferns")).toBeVisible();
    await demo.hover(main.getByText("Water the ferns"), 1200);
    await demo.waitForSpeech();

    // A warm closing line over the final screen.
    await demo.narrate("outro");
    await demo.hover(page.getByRole("heading", {level: 1}), 1000);
    await demo.waitForSpeech();
    await demo.pause(800);
    demo.markEnd();
  } finally {
    await finish();
  }
});
