# Project Brief — TubePlus          (updated: 2026-07-16)

## What this is

TubePlus is a cross-browser MV3 extension (Chrome + Firefox from one shared codebase) that removes Mix/radio and playlist context from YouTube watch URLs so a video plays standalone — no queue, no forced autoplay. It is published on the Chrome Web Store and Firefox AMO (v1.5.0, 2026-06-22) under the name "TubePlus - YouTube Mix & Playlist URL Cleaner". Users are ordinary YouTube viewers on desktop and Android (Chromium-based mobile browsers like Kiwi run the extension against YouTube's mobile web app, m.youtube.com).

## Architecture in brief

- `src/common/url-cleaner.js` — single source of truth: settings model + URL-cleaning decision (unit-tested, `npm test`).
- `src/common/rules.js` — builds declarativeNetRequest dynamic rules from settings (unit-tested).
- `src/common/background.js` — Chrome-only service worker; syncs DNR rules on install/startup/settings change.
- `src/common/content.js` — fallback cleaner: in-app SPA navigations + browsers without DNR (Firefox's ONLY path).
- `src/common/popup.*` — master switch + independent "Mixes & radio" / "Playlists" toggles, stored in `chrome.storage.local`.
- `src/chrome/manifest.json`, `src/firefox/manifest.json` — thin per-browser shells; `scripts/build.js` copies common + shell into `dist/`.
- Key design constraint: the Mix queue is server-rendered from the request URL, so cleaning must happen before the request (DNR) or force one reload (`location.replace` in content script). See `docs/architecture.md`.

## Current state

- v1.5.0 shipped 2026-06-22: rebuilt engine on DNR (Chrome), content-script fallback, granular popup controls, dropped `tabs` permission.
- v1.5.1 was prepared 2026-07-16 but **never released**, and was withdrawn: its Firefox permission changes (`optional_host_permissions`, a "Grant access" popup card, `strict_min_version` 128) fixed a problem the store build does not have, while showing working installs a "TubePlus can't see YouTube pages" card with a dead button.
- v1.5.2 fixed in repo 2026-07-27 (see docs/WORKLOG.md): keeps 1.5.1's real fixes (mobile SPA cleaning, the Firefox `globalThis` crash), reverts both manifests to 1.5.0's exact permission surface, and stops cleaning from breaking YouTube Premium downloads. **Not yet released**; needs a manual Firefox smoke test (steps in WORKLOG) before uploading to the stores.
- Tests pass; build is `npm run build` → store zips in `dist/`.

## Intentions & priorities

1. Fix the 1.5.0 regressions above; keep the "clean before load, no flash" DNR behavior on Chrome. (Inferred from client emails Tav shared 2026-07-16.)
2. Planned next feature (per docs/architecture.md): read video durations across open YouTube tabs and sort tabs — designed to work WITHOUT the `tabs` permission.
3. Standing constraint from Tav: never casually add a permission that triggers an install warning (it disables the extension for all users until re-accepted).

## Hard open questions

- Firefox strategy: can Firefox use DNR (`queryTransform` support?) instead of the content-script-only path, and how to handle Firefox MV3's opt-in host permissions for existing/new users?
- Reliable SPA URL-change detection on BOTH www and m.youtube.com without YouTube-version-specific events.
- (Interview skipped — brief built autonomously from repo on 2026-07-16; confirm priorities with Tav.)

## Constraints & non-goals

- No warning-triggering permissions (`tabs` etc.) without a deliberate, communicated pivot.
- Extension must stay lightweight, local-only (privacy policy: no data collection).
- Non-goal: general cross-site tab management; scope is YouTube only.

## Pointers

- `docs/architecture.md` — design + permission decisions (load-bearing; read before touching permissions).
- `docs/changelog.md` — user-facing history; `docs/privacy.md` — store listing policy text.
- `test/url-cleaner.test.js`, `test/rules.test.js` — node --test suites.
- Store builds: `npm run build:chrome` / `build:firefox` → `dist/tubeplus-*.zip`.
