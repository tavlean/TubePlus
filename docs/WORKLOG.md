# Worklog

## 2026-07-27 — 1.5.2: hotfix the live 1.5.1 incident

**Status when this started: 1.5.1 was PUBLIC on the Chrome Web Store, shipped
2026-07-20, ~715 users, rating down to 3.88 with bad reviews arriving.** The
previous entry below says "Not yet released" and the project brief repeated it;
both were stale, and this session initially believed them and told Tav his users
were unaffected. They were not. **Check the store dashboard, not the brief, before
making any claim about what users have.**

**The bug every 1.5.1 user saw:** the popup showed "TubePlus can't see YouTube
pages yet. Grant access to youtube.com so cleaning can work." with a Grant access
button that did nothing. Cleaning itself was working the whole time. The cause is
not permissions at all — it is a CSS cascade mistake:

```
popup.html:  <div class="card access-card" id="accessCard" hidden>
popup.css:   .card { display: grid; ... }
```

The UA stylesheet's `[hidden] { display: none }` loses to any author `display`
rule, so `hidden` never hid the card, on any browser, for any user, in any
permission state. `refreshHostAccess()` did set `accessCard.hidden = true` on
Chrome — and the card stayed on screen. That is also why the button "did nothing":
whether the grant succeeded, failed, or was already held, the only visible effect
would have been the card disappearing, and it could not disappear.

1.5.2 adds `[hidden] { display: none !important }` at the top of popup.css so this
cannot recur. The e2e suite missed it because it asserted the `.hidden` **property**
rather than computed visibility — assert `getComputedStyle`, not the attribute.

**The permission theory underneath the card was also wrong**, which is why the whole
card is gone rather than restyled. See docs/architecture.md: Firefox grants every
manifest origin (including `content_scripts[].matches`) on ADDON_INSTALL from 127
onward, so store users have always held the youtube.com grant. `optional_host_permissions`
was a no-op, and the `strict_min_version` 128 bump it forced stranded every Firefox
user below 128, including ESR 115.

### The rest of the 1.5.2 change set

**What changed:** `src/firefox/manifest.json` (dropped `host_permissions` and
`optional_host_permissions`, `strict_min_version` 128 → 109), popup (access card,
Grant button, and all `chrome.permissions` code removed from `popup.html`/`.js`/`.css`),
`content.js` (skip cleaning during offline/Downloads playback), version 1.5.2,
`npm test` scoped to `test/*.test.js`, changelog + architecture updated.

**Downloads were broken by design, not by accident.** `location.replace` turns a
client-side SPA navigation into a network navigation. Premium downloads play from
local storage exactly when the network is unavailable, so cleaning one replaced a
working offline video with a failed load. Reported by Tav, who blocks youtube.com at
DNS level: disabling the extension made every downloaded video play again.

**A loop guard now caps repeated reloads** (`sessionStorage`, per tab, because each
reload starts a fresh document and an in-memory counter cannot see across them). The
1.5.1 URL watcher fires on any address-bar rewrite, and `music.youtube.com` rewrites
the URL on every track change, so any surface that re-adds playlist context after our
reload would loop forever. Not reproduced; the guard is insurance, not a fix.

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
  `navigator.onLine`. `/feed/downloads` is confirmed as the desktop Downloads feed;
  what is **unverified** is whether its watch links carry `list=` (if they do not,
  the cleaner never fired on them and the reported breakage has another cause).
  Known gaps, accepted for the hotfix: `navigator.onLine` reports true on a
  connected-but-dead network, and a cold start straight into a downloaded video has
  `previousPath === "/watch"` and is not covered.

**YouTube Music was in scope since 1.5.0 and is now excluded.** Measured, not
theorised: the shipped cleaner stripped `list=OLAK5uy_…` (albums) and `list=RDAMVM…`
(stations — they start with `RD`, so the "Playlists" toggle did not spare them),
leaving a one-song queue. 1.5.1's URL watcher made it worse by reacting to YT Music's
per-track address-bar rewrites. Excluded in both engines with unit tests plus a
Chromium assertion; see docs/architecture.md "Scope".

**New gate: `npm run test:smoke`.** Offline Chromium check of the built extension —
no youtube.com needed, so it runs anywhere in ~20s. It asserts the DNR rules are
actually accepted by Chrome (a rejected rule set means Chrome cleans nothing,
silently), that the music.youtube.com exclusion survives into the registered rules,
and that the popup shows no missing-access warning. Run it before every upload.
Note it needs `channel: "chromium"` — the bundled default headless never starts the
extension service worker.

**Open risks, ranked — carry these into the next session:**
1. `docs/privacy.md` lists `declarativeNetRequest` as a permission TubePlus uses.
   The Firefox build has only `storage`, and the privacy page is shared by both
   store listings, so the AMO listing overstates what the add-on requests.
2. `docs/changelog.md` moved the shipped 1.5.0 date from 2026-06-16 to 2026-06-22 in
   commit `bac3d08`. One of the two is wrong in a user-facing document; check the
   store listing.
3. The `<fieldset id="cleanOptions">` in popup.html lost its `<legend>` in `ca1b57c`,
   so the toggle group has no accessible name.

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
