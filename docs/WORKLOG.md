# Worklog

## 2026-07-16 — 1.5.1: fix the 1.5.0 regressions reported by a user

**What changed:** `content.js` (SPA navigation detection rebuilt + `globalThis`
namespace fix), popup (missing-host-access card with Grant button),
`src/firefox/manifest.json` (`host_permissions` + `optional_host_permissions`,
`strict_min_version` 109 → 128), version bump to 1.5.1, architecture doc updated.

**Why:** A user reported (two emails, 2026-07-16) that after 1.5.0 the extension
stopped cleaning entirely on Firefox desktop 152, and on Chromium (desktop Chrome
150 / Kiwi Android 137) only cleaned when a URL was opened in a new tab, never on
a normal in-app click. Three root causes, all introduced by the 1.5.0 rewrite:

1. **Mobile SPA clicks were never detected** (reproduced in an automated Chromium
   harness before the fix, verified cleaned after). m.youtube.com does not fire
   `yt-navigate-finish` (desktop-only event); it fires `state-navigateend` on
   window. 1.5.0 had dropped 1.4.1's MutationObserver URL watcher that used to
   cover this. `popstate` never fires for pushState, so it caught nothing.
2. **Firefox content script crashed on line 1:** `url-cleaner.js` attaches the
   shared API to `globalThis`, `content.js` read `window.TubePlusUrlCleaner`; in
   Firefox content scripts these are different objects (MDN-documented), so the
   destructure threw and Firefox (which has no DNR path) cleaned nothing.
3. **Firefox MV3 host-permission gate:** content scripts only run on user-granted
   origins, and extension updates never auto-grant new origins. Users in that
   state have a silently dead extension; the new popup card lets them grant
   youtube.com access with one click.

**Gotchas for future sessions:**
- Verified via Playwright Chromium harness (persistent context +
  `--load-extension` of `dist/chrome-dev`, desktop + Pixel-7 mobile emulation,
  real youtube.com): direct loads clean via DNR, SPA clicks clean via content
  script, popup loads with the access card hidden on Chrome. The harness script
  pattern is worth recreating for any future engine change.
- Firefox was NOT live-tested this session (no automatable Firefox+extension path
  on this machine). `web-ext lint` passes with 0 errors. Before releasing, load
  `dist/firefox-dev` as a temporary add-on in Firefox and check: (a) a Mix URL
  cleans, (b) the popup shows the Grant access card when the youtube.com toggle
  is off in about:addons → Permissions, and the button works.
- Kiwi Browser was discontinued in January 2025; users are on frozen builds.
  Nothing to do, but don't optimize for it.
- Firefox DNR (with `queryTransform.removeParams`, supported since ~113 per MDN)
  is the plausible next upgrade for no-reload cleaning on Firefox, but it still
  requires the same host-permission grant, and per docs/architecture.md it must
  be verified live before shipping.
