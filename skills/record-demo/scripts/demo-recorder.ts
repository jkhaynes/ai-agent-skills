import type {Locator, Page} from "@playwright/test";

/**
 * Helpers that make a Playwright run watchable as a screen recording: a visible cursor with a click
 * ripple, captions, and human pacing for moves, clicks, typing and scrolling.
 *
 * Playwright's recorded video has no cursor of its own, and its actions are instant, so a recording
 * of an ordinary spec is a blur of screens changing with no hand on them. Everything here exists to
 * slow that down and show the viewer what is being pressed.
 *
 * The cursor lives in the top document only and is moved from here, not by mouse events: over an
 * iframe (an embedded app, a payment form, an OAuth widget) mouse events never reach the top
 * document, so a listener-driven cursor would freeze at the iframe's edge.
 *
 * Typical use, inside a shot spec (see demo-session.ts for the session around it):
 *
 *   demo.markStart();                       // trims the blank frames before the first page drew
 *   await demo.narrate("intro");            // starts a voice line; the next narrate waits for it
 *   await demo.click(page.getByRole("button", {name: "Add task"}));
 *   await demo.type(page.getByLabel("Title"), "Water the ferns");
 *   await demo.waitForSpeech();             // don't leave a screen mid-sentence
 *   demo.markEnd();
 */

const OVERLAY = `
(() => {
  if (window.top !== window || window.__demoOverlay) return;
  window.__demoOverlay = true;
  const style = document.createElement("style");
  style.textContent = \`
    #demo-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px;
      border-radius: 50%; background: rgba(236, 72, 153, 0.35); border: 2px solid rgba(236, 72, 153, 0.9);
      pointer-events: none; transition: transform 120ms ease; left: -100px; top: -100px; }
    #demo-cursor.down { transform: scale(0.7); }
    .demo-ripple { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px;
      border-radius: 50%; border: 3px solid rgba(236, 72, 153, 0.8); pointer-events: none;
      animation: demo-ripple 500ms ease-out forwards; }
    @keyframes demo-ripple { from { transform: scale(0.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
    #demo-caption { position: fixed; z-index: 2147483645; left: 50%; bottom: 40px; transform: translateX(-50%);
      max-width: 80%; padding: 12px 22px; border-radius: 12px; background: rgba(17, 17, 27, 0.86); color: #fff;
      font: 500 20px/1.35 -apple-system, "Segoe UI", Inter, sans-serif; pointer-events: none;
      opacity: 0; transition: opacity 250ms ease; }
    #demo-caption.show { opacity: 1; }
  \`;
  const mount = () => {
    document.head.appendChild(style);
    const cursor = Object.assign(document.createElement("div"), {id: "demo-cursor"});
    const caption = Object.assign(document.createElement("div"), {id: "demo-caption"});
    document.body.append(cursor, caption);
    window.__demoCursor = (x, y, down) => {
      // Coordinates arrive in viewport pixels; under a page zoom, fixed positions are in zoomed ones.
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      x /= zoom; y /= zoom;
      cursor.style.left = x + "px"; cursor.style.top = y + "px";
      cursor.classList.toggle("down", !!down);
      if (!down) return;
      const ripple = Object.assign(document.createElement("div"), {className: "demo-ripple"});
      ripple.style.left = x + "px"; ripple.style.top = y + "px";
      document.body.appendChild(ripple); setTimeout(() => ripple.remove(), 600);
    };
  };
  if (document.body) mount(); else addEventListener("DOMContentLoaded", mount);
})();
`;

const LINE_GAP_MS = Number(process.env.DEMO_LINE_GAP_MS ?? 0);

/**
 * One narration line: what the voiceover speaks, and optionally a short on-screen caption. Videos
 * with burned-in subtitles (narration.mjs mix --subtitles) leave the caption out.
 */
export type NarrationLine = {say: string; caption?: string};

/** When each narration line started, in ms from the start of the recording. */
export type NarrationCue = {key: string; atMs: number};

export class DemoRecorder {
  private x = 800;
  private y = 450;
  // Playwright's video starts with the page, so time from here lines cues up with the recording
  // to within the few hundred ms the first navigation takes, which is below what a viewer notices.
  private readonly startedAt = Date.now();
  private speechEndsAt = 0;
  readonly cues: NarrationCue[] = [];
  /** Where the finished video should start and end, in ms from the start of the recording. */
  startMs = 0;
  endMs?: number;

  /**
   * @param clipMs how long each line's voice clip runs, by key, from scripts/demo-narration.mjs
   *   prepare. Without it the recorder captions only, and nothing waits for speech.
   */
  constructor(
    private readonly page: Page,
    private readonly lines: Record<string, NarrationLine> = {},
    private readonly clipMs: Record<string, number> = {},
  ) {}

  /**
   * Installs the cursor and caption layer on every document the page loads. Call before navigating.
   * `extraCss` is applied from the first paint too: a style added after load shows for a frame or
   * two in a recording.
   */
  async install(extraCss = ""): Promise<void> {
    await this.page.addInitScript(OVERLAY);
    if (extraCss)
      await this.page.addInitScript((css) => {
        const add = () =>
          document.head.appendChild(
            Object.assign(document.createElement("style"), {textContent: css}),
          );
        if (document.head) add();
        else addEventListener("DOMContentLoaded", add);
      }, extraCss);
  }

  /** Puts the cursor where the previous screen left it, after a navigation replaced the document. */
  async restoreCursor(): Promise<void> {
    await this.page.mouse.move(this.x, this.y);
    await this.drawCursor(false);
  }

  private async drawCursor(down: boolean): Promise<void> {
    await this.page.evaluate(
      ([x, y, d]) =>
        (
          window as unknown as {__demoCursor?: (x: number, y: number, d: boolean) => void}
        ).__demoCursor?.(x, y, d),
      [this.x, this.y, down] as const,
    );
  }

  /** Marks the first frame worth keeping, e.g. once the first page has loaded; the mix trims before it. */
  markStart(): void {
    this.startMs = Date.now() - this.startedAt;
  }

  /** Marks the last frame worth keeping; the mix trims after it, so the browser closing isn't shown. */
  markEnd(): void {
    this.endMs = Date.now() - this.startedAt;
  }

  /** Stretches of the recording the mix removes, in ms from its start, e.g. a person solving a captcha. */
  readonly cuts: {fromMs: number; toMs: number}[] = [];
  private cutFrom?: number;

  /**
   * Starts a stretch to cut. Let the current line finish first (waitForSpeech): speech that runs
   * into a cut is cut with it.
   */
  cutStart(): void {
    this.cutFrom = Date.now() - this.startedAt;
  }

  /** Ends the stretch begun by cutStart. Speech waits restart from here, so no line is skipped. */
  cutEnd(): void {
    if (this.cutFrom === undefined) throw new Error("cutEnd without cutStart");
    this.cuts.push({fromMs: this.cutFrom, toMs: Date.now() - this.startedAt});
    this.cutFrom = undefined;
    this.speechEndsAt = 0;
  }

  async pause(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Shows a narration line's caption and logs a cue for its voice clip. Waits first for the
   * previous line to finish speaking, so two clips never overlap in the mixed audio.
   */
  async narrate(key: string): Promise<void> {
    const line = this.lines[key];
    if (!line) throw new Error(`no narration line "${key}"`);
    const wait = this.speechEndsAt - Date.now();
    if (wait > 0) await this.pause(wait);
    this.cues.push({key, atMs: Date.now() - this.startedAt});
    // No gap is added between lines by default: each clip already starts and ends with about 0.6s of
    // silence in total, and more makes the voiceover sound halting. DEMO_LINE_GAP_MS adds one.
    this.speechEndsAt = Date.now() + (this.clipMs[key] ?? 0) + LINE_GAP_MS;
    if (line.caption) await this.caption(line.caption);
  }

  /** Waits until the current line has finished speaking, e.g. before leaving a screen it describes. */
  async waitForSpeech(): Promise<void> {
    const wait = this.speechEndsAt - Date.now();
    if (wait > 0) await this.pause(wait);
  }

  async caption(text: string): Promise<void> {
    await this.page.evaluate((t) => {
      const el = document.getElementById("demo-caption");
      if (!el) return;
      el.textContent = t;
      el.classList.add("show");
    }, text);
  }

  async clearCaption(): Promise<void> {
    await this.page.evaluate(() =>
      document.getElementById("demo-caption")?.classList.remove("show"),
    );
  }

  /** Glides the cursor to the centre of `target` instead of teleporting there. */
  async moveTo(target: Locator): Promise<void> {
    // Locator actions here have no timeout of their own, so a missing target would hang the take
    // until the test's limit; fail within half a minute instead, naming the target.
    await target.waitFor({state: "visible", timeout: 30_000});
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("demo target has no box: is it visible?");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const steps = Math.max(12, Math.round(Math.hypot(x - this.x, y - this.y) / 18));
    const [fromX, fromY] = [this.x, this.y];
    for (let i = 1; i <= steps; i += 1) {
      // Ease in and out, so the glide starts and lands gently rather than at constant speed.
      const t = 0.5 - Math.cos((Math.PI * i) / steps) / 2;
      this.x = fromX + (x - fromX) * t;
      this.y = fromY + (y - fromY) * t;
      await this.page.mouse.move(this.x, this.y);
      await this.drawCursor(false);
    }
  }

  /**
   * Rests the cursor on `target`. Only for show, so a target that can't be found doesn't fail the
   * take: the cursor stays put for the same time instead. Clicks and typing still fail loudly.
   */
  async hover(target: Locator, holdMs = 600): Promise<void> {
    await this.moveTo(target).catch((error: unknown) =>
      console.log(
        `hover skipped: ${error instanceof Error ? error.message.split("\n")[0] : error}`,
      ),
    );
    await this.pause(holdMs);
  }

  /** Moves to `target`, lets the viewer see where the cursor landed, then clicks. */
  async click(target: Locator): Promise<void> {
    await this.moveTo(target);
    await this.pause(250);
    await this.drawCursor(true);
    await this.page.mouse.down();
    await this.pause(90);
    await this.page.mouse.up();
    await this.drawCursor(false);
  }

  /**
   * Replaces a field's value at a readable speed: a recording of `fill()` shows the whole value
   * appearing at once. The existing text is selected first, since the click lands wherever the
   * field's centre is, often mid-value.
   */
  async type(target: Locator, text: string, delayMs = 75): Promise<void> {
    await this.click(target);
    await target.selectText();
    await this.pause(300);
    await target.pressSequentially(text, {delay: delayMs});
  }

  /** Scrolls smoothly until `target` sits near the top of the viewport, then waits for the scroll to settle. */
  async scrollTo(target: Locator, offset = 16): Promise<void> {
    await target.evaluate((el, off) => {
      const top = (el.closest("section") ?? el).getBoundingClientRect().top + window.scrollY - off;
      window.scrollTo({top, behavior: "smooth"});
    }, offset);
    await this.pause(1200);
  }

  async scrollToTop(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo({top: 0, behavior: "smooth"}));
    await this.pause(1000);
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() =>
      window.scrollTo({top: document.body.scrollHeight, behavior: "smooth"}),
    );
    await this.pause(1400);
  }
}
