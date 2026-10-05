import {existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {chromium, type Browser, type BrowserContext, type Page, type TestInfo} from "@playwright/test";
import {DemoRecorder, type NarrationLine} from "./demo-recorder";

/**
 * A recording session for one shot of a demo: a browser that records video, a DemoRecorder driving
 * it, and `finish()`, which saves the video and the narration cues where narration.mjs mixes them.
 *
 * Paths follow narration.mjs: a shot named `portfolio/01-intro` has its spec and narration in
 * `demos/shots/portfolio/01-intro.{spec.ts,narration.json}`, and its recording, voice clips and cues
 * in `artifacts/demo/narration/portfolio/01-intro/`. DEMO_SHOTS_DIR and DEMO_OUT_DIR move them.
 */
export const SHOTS_DIR = process.env.DEMO_SHOTS_DIR ?? "demos/shots";
export const OUT_DIR = process.env.DEMO_OUT_DIR ?? "artifacts/demo";

export type DemoSessionOptions = {
  /**
   * A signed-in Chrome profile under `artifacts/demo/profiles/<profile>`, saved by signin.mjs. Leave
   * it out for apps that need no sign-in: the shot then starts from a fresh, empty browser.
   */
  profile?: string;
  /**
   * Text size, as browser zoom would set it. 1.25 reads well in a 1080p video. It's applied as a CSS
   * zoom on the top document: Playwright records the viewport's CSS size, so a device scale factor
   * would crop the frame instead of enlarging it.
   */
  zoom?: number;
  /**
   * false records a smaller viewport at 100% instead (1536×864 for zoom 1.25), which the mix scales
   * up to the full frame: the same layout, a little softer. Use it for pages with a code editor
   * (CodeMirror, Monaco), which place clicks wrongly under a CSS zoom.
   */
  cssZoom?: boolean;
  /** CSS applied from the first paint, e.g. to hide a chat widget or cookie banner. */
  hideCss?: string;
};

export type DemoSession = {
  context: BrowserContext;
  page: Page;
  demo: DemoRecorder;
  /** Saves the video and cues. Call it in a `finally`, so a failed check still keeps the footage. */
  finish: () => Promise<void>;
};

const FRAME = {width: 1920, height: 1080};

/**
 * @param name the shot's path under the shots folder without `.spec.ts`, e.g. `portfolio/01-intro`,
 *   which is also the name narration.mjs prepares and mixes it under.
 */
export async function openDemoSession(
  name: string,
  testInfo: TestInfo,
  options: DemoSessionOptions = {},
): Promise<DemoSession> {
  const zoom = options.zoom ?? 1.25;
  const cssZoom = options.cssZoom ?? true;
  const viewport = cssZoom
    ? FRAME
    : {width: Math.round(FRAME.width / zoom), height: Math.round(FRAME.height / zoom)};
  const recordVideo = {dir: testInfo.outputPath("video"), size: viewport};
  const headless = process.env.DEMO_HEADLESS === "1";

  let browser: Browser | undefined;
  let context: BrowserContext;
  if (options.profile) {
    const userDataDir = resolve(OUT_DIR, "profiles", options.profile);
    if (!existsSync(userDataDir))
      throw new Error(
        `no "${options.profile}" profile: run node demos/signin.mjs ${options.profile} <url>...`,
      );
    // The `chrome` channel, because signin.mjs made the profile with ordinary Chrome.
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless,
      viewport,
      recordVideo,
    });
  } else {
    browser = await chromium.launch({headless});
    context = await browser.newContext({viewport, recordVideo});
  }
  const page = context.pages()[0] ?? (await context.newPage());

  const narrationFile = join(SHOTS_DIR, `${name}.narration.json`);
  const narration = existsSync(narrationFile)
    ? (JSON.parse(readFileSync(narrationFile, "utf8")) as Record<string, NarrationLine>)
    : {};
  const clipsFile = join(OUT_DIR, "narration", name, "clips.json");
  const clipMs = existsSync(clipsFile)
    ? (JSON.parse(readFileSync(clipsFile, "utf8")) as Record<string, number>)
    : {};
  if (Object.keys(narration).length && !Object.keys(clipMs).length)
    console.warn(
      `${name}: no voice clips yet, so nothing waits for speech. Run: node demos/narration.mjs prepare ${name}`,
    );
  const demo = new DemoRecorder(page, narration, clipMs);
  await demo.install(options.hideCss ?? "");
  if (cssZoom && zoom !== 1)
    await context.addInitScript((z: number) => {
      if (window.top !== window) return;
      // Init scripts can run before the document has a root element, so this retries once it does.
      const apply = () => {
        if (document.documentElement) document.documentElement.style.zoom = String(z);
      };
      apply();
      addEventListener("DOMContentLoaded", apply);
    }, zoom);
  await redact(context);

  let finished = false;
  return {
    context,
    page,
    demo,
    async finish() {
      if (finished) return;
      finished = true;
      const dir = join(OUT_DIR, "narration", name);
      mkdirSync(dir, {recursive: true});
      if (demo.endMs === undefined) demo.markEnd();
      const cues = {startMs: demo.startMs, endMs: demo.endMs, cuts: demo.cuts, cues: demo.cues};
      writeFileSync(join(dir, "cues.json"), JSON.stringify(cues, null, 2));
      // The video is only complete once its context closes.
      await context.close();
      await browser?.close();
      // Playwright names the file at random and shortens long output folders with a hash, so the
      // video moves next to its cues under a name narration.mjs can find.
      const videoDir = testInfo.outputPath("video");
      const [webm] = existsSync(videoDir)
        ? readdirSync(videoDir).filter((f) => f.endsWith(".webm"))
        : [];
      if (webm) renameSync(join(videoDir, webm), join(dir, "video.webm"));
    },
  };
}

/**
 * Hides personal details in every frame: an account name in a header, an email in a footer. Entries
 * come from DEMO_REDACT, comma-separated, so they never live in the repository:
 *
 *   DEMO_REDACT="Jane Doe=Demo User,jane@example.com=demo@example.com,JD=DU"
 *
 * `real=stand-in` swaps in a plausible stand-in, which reads more naturally on screen than a gap; a
 * bare `real` blanks it. List longer strings before their prefixes ("Jane Doe,Jane D"), since each
 * is replaced wherever it appears. Strings of three characters or fewer, like initials, are only
 * replaced when they're an element's whole text, so "JD" can't eat into other words; avatars that
 * carry them in an `initials` attribute get the stand-in too, or are hidden when there is none.
 */
async function redact(context: BrowserContext): Promise<void> {
  const pairs = (process.env.DEMO_REDACT ?? "")
    .split(",")
    .map((entry) => entry.split("=").map((s) => s.trim()))
    .filter(([real]) => Boolean(real))
    .map(([real, standIn]) => [real, standIn ?? ""] as [string, string])
    // A stand-in containing its own original would be replaced again on every change, forever.
    .filter(([real, standIn]) => !standIn.includes(real));
  if (pairs.length === 0) return;
  await context.addInitScript((replacements: [string, string][]) => {
    const short = replacements.filter(([real]) => real.length <= 3);
    const hideAvatars = short
      .filter(([, standIn]) => !standIn)
      .map(([real]) => `[initials="${real}"]{visibility:hidden!important}`)
      .join("");
    if (hideAvatars) {
      const style = () =>
        document.head?.appendChild(
          Object.assign(document.createElement("style"), {textContent: hideAvatars}),
        );
      if (document.head) style();
      else addEventListener("DOMContentLoaded", style);
    }
    const scrub = (root: Node) => {
      if (root instanceof Element) {
        for (const el of [root, ...root.querySelectorAll("[initials]")])
          for (const [real, standIn] of short)
            if (standIn && el.getAttribute("initials") === real)
              el.setAttribute("initials", standIn);
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode())
        for (const [real, standIn] of replacements) {
          const value = node.nodeValue ?? "";
          if (real.length <= 3) {
            if (value.trim() === real) node.nodeValue = value.replace(real, standIn);
          } else if (value.includes(real)) node.nodeValue = value.replaceAll(real, standIn);
        }
    };
    const start = () => {
      scrub(document.body);
      new MutationObserver((changes) => {
        for (const change of changes) {
          if (change.type === "characterData") scrub(change.target.parentNode ?? change.target);
          for (const added of change.addedNodes) scrub(added);
        }
      }).observe(document.body, {subtree: true, childList: true, characterData: true});
    };
    if (document.body) start();
    else addEventListener("DOMContentLoaded", start);
  }, pairs);
}
