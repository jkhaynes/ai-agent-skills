#!/usr/bin/env node
// Opens a recording profile in ordinary Chrome so a person can sign in by hand, once.
//
//   node demos/signin.mjs <profile> <url> [url...]
//   node demos/signin.mjs owner http://localhost:3000/login https://github.com/login
//
// Shots that need a signed-in app run in a Chrome profile kept under artifacts/demo/profiles/<profile>
// (keep artifacts/ out of git). Sign in on each tab, then close the window; the shots reuse the
// session, so no script ever types a password. Use one profile per person the demo shows: a site
// signs in one account per browser, so an "owner" and a "customer" need a profile each.
//
// This opens plain Chrome rather than a Playwright-controlled browser: many sign-in pages run
// captchas that fail under automation. The shots later open the same profile with Playwright's
// `chrome` channel, so the profile format matches. CHROME_PATH overrides the install location.
import {spawn} from "node:child_process";
import console from "node:console";
import {existsSync} from "node:fs";
import {join, resolve} from "node:path";
import process from "node:process";

const [profile, ...urls] = process.argv.slice(2);
if (!profile || urls.length === 0) {
  console.error("usage: node demos/signin.mjs <profile> <url> [url...]");
  process.exit(2);
}

const defaults = {
  win32: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  ],
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"],
};
const chrome =
  process.env.CHROME_PATH ?? (defaults[process.platform] ?? []).find((p) => existsSync(p));
if (!chrome) {
  console.error("Chrome not found: install Google Chrome or set CHROME_PATH.");
  process.exit(1);
}

const outDir = process.env.DEMO_OUT_DIR ?? join("artifacts", "demo");
const userDataDir = resolve(outDir, "profiles", profile);
const browser = spawn(
  chrome,
  [`--user-data-dir=${userDataDir}`, "--no-first-run", "--new-window", ...urls],
  {stdio: "ignore"},
);
console.log(`Sign in on each tab of the "${profile}" profile, then close the Chrome window.`);
await new Promise((done) => browser.on("exit", done));
console.log(`"${profile}" profile saved in ${userDataDir}.`);
