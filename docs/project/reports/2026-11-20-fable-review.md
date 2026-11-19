# Whole-project review (2026-11-20)

Read-only review of TubePlus at commit `5a31797` (v1.5.2 in repo): all of `src/`, both
manifests, `scripts/build.js`, the tests and the docs. Nothing was run in a browser;
every finding is from reading the code, so verify each in the offline harness before
acting. Ranked by value to users first, then by risk removed. Sizes: S under an hour,
M half a day, L more.

Overall: the core is small, well commented and does what the docs say. The weak spots
are the release process (all gates are manual, which is how 1.5.1 shipped), the cost of
the content-script path, and a few places where the two engines can still disagree.

## 1. Automate the release gates and freeze the permission surface (M)

- Evidence: no `.github/` directory; `docs/architecture.md:136-139` asks for a manual
  `diff` against `git show bac3d08` before every release; the version lives in three
  places (`package.json:3`, `src/chrome/manifest.json:4`, `src/firefox/manifest.json:4`).
- Why: both incidents (1.5.0 Firefox crash, 1.5.1 popup card) were release-gate
  failures, and the one standing rule (never add a warning permission) is enforced
  only by memory. As of 2026-11-19 the browser gates could not even run locally
  because the Playwright Chromium build was missing.
- Fix: (a) a unit test that asserts `permissions`, `host_permissions`,
  `content_scripts[].matches` and `strict_min_version` of both manifests equal a frozen
  list, and that the three version strings match; (b) a GitHub Actions workflow running
  `pnpm test`, `pnpm run build`, `test:smoke` and `test:offline` on push
  (`pnpm/action-setup` before `setup-node`, then `pnpm exec playwright install chromium`).

## 2. Run the content script at `document_start` (S, biggest win for Firefox)

- Evidence: `run_at: "document_end"` in `src/chrome/manifest.json:15` and
  `src/firefox/manifest.json:11`; `content.js` reads only `location` and storage and
  observes `document`, none of which need the DOM.
- Why: on Firefox the content script is the only engine. Waiting for the full HTML
  parse before `location.replace` means the Mix page is downloaded and often starts
  rendering before the reload. `docs/architecture.md:17` correctly says `document_start`
  cannot avoid the reload, but it makes the reload start far sooner and shrinks the
  flash. Same gain for the rare Chrome cases DNR misses (`start_radio` without `list`).
- Fix: change `run_at` in both manifests. It is not a permission change, so no warning.
  Confirm in `test:offline` and with one manual Firefox temporary-add-on load.

## 3. Intercept SPA navigations before they commit (M, prototype first)

- Evidence: `content.js:127-135` reacts to `yt-navigate-finish`, `state-navigateend`
  and `currententrychange`, all of which fire after YouTube has already loaded the
  Mix; `content.js:91` then reloads. `docs/architecture.md:6` states the goal as "no
  reload, no flash".
- Why: every in-app Mix click costs a wasted SPA load (audio can start) plus a full
  reload. This is the most common path on mobile and the only path on Firefox.
- Fix: listen for the Navigation API `navigate` event (fires before commit, exposes
  `event.destination.url`, cancelable for same-document navigations) and for
  capture-phase clicks on `a[href]` whose cleaned URL differs; cancel and
  `location.assign(cleanURL)`. That is one load instead of two and the dirty URL never
  enters history. Keep today's listeners as the fallback. It keys on URLs only, so it
  is no more fragile to YouTube DOM changes than today.

## 4. Firefox DNR, behind runtime detection (L, already an open question)

- Evidence: `docs/architecture.md:143-147`, `background.js:9` already guards on
  `chrome.declarativeNetRequest`; `scripts/build.js:18` strips the files from Firefox.
- Why: it is the only way Firefox users get the no-reload behavior the listing sells.
- Fix: needs a Firefox `background.scripts` entry (no `importScripts` there) and the
  DNR permission, so it must go through the permission rules in architecture.md and a
  live test. Do items 2 and 3 first; they need no manifest permission change.

## 5. Anchor the DNR regex and make it case sensitive (S)

- Evidence: `rules.js:15-18` patterns start at `/watch\\?` with no anchor, and
  `rules.js:32-40` sets no `isUrlFilterCaseSensitive` (Chrome defaults to false since
  118). `url-cleaner.js:18` and `:44` are case sensitive and require
  `pathname === "/watch"`. `rules.test.js:39` and `:92` emulate with the `i` flag on a
  path only, so the test cannot see either gap.
- Why: the engines can disagree, which architecture.md calls the thing to prevent. DNR
  would strip `list` from `youtube.com/anything/watch?v=a&list=b` or a URL whose query
  embeds an unencoded `/watch?v=..&list=..`, and treats `list=rdX` as a Mix.
- Fix: prefix both patterns with `^https?://[^/]+` and set
  `isUrlFilterCaseSensitive: true`; feed full URLs through the agreement table.

## 6. Make rule sync self-healing and observable (S)

- Evidence: `background.js:15-18` ignores the result of `updateDynamicRules`;
  `background.js:22-23` only syncs on install and browser startup.
- Why: the call is atomic, so one rejected rule leaves the old set active while the
  popup shows the new settings (for example Playlists still cleaned after turning it
  off). The content script fallback hides the failure on the other side. Two quick
  toggles can also interleave their `get` and `update` pairs.
- Fix: call `applyRules()` at the top level of the worker (cheap, runs on every wake),
  serialize calls through one promise chain, and `console.error` on rejection.
  `test:smoke` already checks the registered set (`chrome-offline.js:71-72`).

## 7. Loop guard misses loops that do not start at the clean URL (S)

- Evidence: `content.js:39-48` returns "allowed" and clears the counter whenever the
  document did not start at the target URL.
- Why: if YouTube ever answers a clean URL with a server redirect back to a `list=`
  URL, each document starts dirty, the guard never counts, and Firefox reloads forever
  (Chrome would hit `ERR_TOO_MANY_REDIRECTS` through DNR). Unlikely today, but silent
  and total when it happens, and it is exactly the class the guard exists for.
- Fix: add a second, time-based limit in the same `sessionStorage` record, for example
  no more than 3 cleans to the same target within 10 seconds, regardless of start URL.

## 8. Narrow where and how the content script runs (S)

- Evidence: both manifests match `*://*.youtube.com/*` with no `exclude_matches`, so
  the script loads on music.youtube.com (where `url-cleaner.js:8` makes it a no-op),
  studio and accounts. `content.js:137-143` installs a whole-document MutationObserver
  unconditionally, although its comment calls it a fallback for engines without the
  Navigation API (`content.js:133`).
- Why: YouTube mutates the DOM constantly; the callback is cheap but runs on every
  batch on every YouTube tab for no benefit in Chrome and Firefox 147+.
- Fix: add `exclude_matches: ["*://music.youtube.com/*"]` (reduces scope, no warning)
  and create the observer only when `window.navigation` is absent.

## 9. Turning a toggle on reloads every open playlist tab at once (S, product call)

- Evidence: `content.js:145-157` calls `maybeClean()` on any settings change.
- Why: a user who paused TubePlus to watch a playlist, then re-enables it, loses the
  queue and playback position in every background tab immediately.
- Fix: on a settings change only update `settings`; clean on the next navigation. Or
  clean only when `document.visibilityState === "visible"`. Needs Tavlean's call.

## 10. Small cleanups and docs drift (S each)

- `rules.js:5` duplicates `PLAYLIST_PARAMS` from `url-cleaner.js:2`; export once or
  assert equality in `rules.test.js`. `rules.js:32-40` and `:49-57` repeat one condition.
- `url-cleaner.js:22,31-34` and `background.js:30` migrate a `mode` setting described
  as a branch shape. If it never shipped to a store, it is dead code; confirm and drop.
- `docs/architecture.md:144-145` says `background.js` and `rules.js` are copied to the
  Firefox build; `scripts/build.js:18` excludes them. Line 143 says `queryTransform`
  is unverified and line 146 says MDN documents it; state one position.
- `test/e2e/firefox.e2e.js:21-23` still refers to the removed popup card flow.
- `docs/privacy.md:23` lists the DNR permission, which the Firefox build does not
  request (already noted in the 2026-07-27 worklog entry; still open).
- `docs/project/brief.md` quotes test counts and a 2026-07-16 "updated" date while
  describing later work; drop the counts and re-date it.
- `popup.html:34` fieldset has no legend, so the toggle group has no accessible name.
- No lint or type check exists. `// @ts-check` plus `tsc --noEmit --checkJs` with
  `@types/chrome` would have caught the 1.5.0 `window` versus `globalThis` crash class.
- `src/chrome/manifest.json` has no `minimum_chrome_version`; `requestDomains` needs
  Chrome 101, below which the rule update fails silently (ties into item 6).

## Not a problem

Privacy and permissions hold up: no network calls, no remote code, storage is local
only, the script runs in the top frame only, and the permission set is the minimum the
DNR design allows. The offline harness (`test/e2e/offline.e2e.js`, `fake-youtube.js`)
is a strong asset; items 2, 3, 5 and 7 should each add cases to it.
