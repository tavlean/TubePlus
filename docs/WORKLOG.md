# Worklog

## 2026-07-27 — 1.5.2: withdraw the 1.5.1 permission change, fix offline downloads

**What changed:** `src/firefox/manifest.json` (dropped `host_permissions` and
`optional_host_permissions`, `strict_min_version` 128 → 109), popup (access card,
Grant button, and all `chrome.permissions` code removed from `popup.html`/`.js`/`.css`),
`content.js` (skip cleaning during offline/Downloads playback), version 1.5.2,
`npm test` scoped to `test/*.test.js`, changelog + architecture updated.

**Why:** Tav opened 1.5.1 and hit "TubePlus can't see YouTube pages yet" with a
Grant access button that did nothing. Two separate faults:

1. **The card was a false alarm and the button could not have fixed it.** 1.5.1's
   whole permission story rested on the claim that Firefox users end up without the
   youtube.com grant. From Firefox 127, origins in `content_scripts.matches` are
   shown at install and granted at install (Bugzilla 1889402), and 1.5.0 already
   requested exactly that origin — so AMO users had the grant all along, and 1.5.2
   requesting the same origin means there is nothing new for the update to grant
   (Bugzilla 1893232 is about *new* origins). The profiles where
   `permissions.contains` returns false are revoked-by-hand installs and
   **temporary add-ons loaded from about:debugging, which get no install prompt and
   therefore no grant** — i.e. precisely the smoke-test path the previous session's
   own worklog told the next person to use. The 1.5.1 change also raised
   `strict_min_version` to 128, stranding every Firefox user below that.
2. **Downloads were broken by design, not by accident.** `location.replace` turns a
   client-side SPA navigation into a network navigation. Premium downloads play from
   local storage exactly when the network is unavailable, so cleaning one replaced a
   working offline video with a failed load. Reported by Tav, who blocks youtube.com
   at DNS level: disabling the extension made every downloaded video play again.

**The rule this session bought:** both manifests are now byte-identical to the
shipped 1.5.0 except the version string. `diff` them against
`git show bac3d08:src/<browser>/manifest.json` before any release — that check is
worth more than any amount of reasoning about what a browser "should" grant.

**Gotchas for future sessions:**
- `npm test` was `node --test` with no path. Node's runner treats every `.js` under
  a directory named `test/` as a test file, so the new `test/e2e/*.js` suites were
  running as unit tests — launching real browsers against real youtube.com and
  hanging. Now scoped explicitly.
- Firefox could not be automated on this machine either: `geckodriver` fails with
  "Failed to read marionette port", and launching `/Applications/Firefox.app` headless
  by hand never initialises the profile (no `MarionetteActivePort`, port 2828 never
  opens). Firefox verification is still manual.
- The Downloads guard keys on `previousPath === "/feed/downloads"` plus
  `navigator.onLine`. The `navigator.onLine` half is unconditionally correct; the
  path half assumes the desktop Downloads feed lives at `/feed/downloads` and that
  its watch links carry `list=`. **Unverified** — needs a real Premium account to
  confirm the URL shape.

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
