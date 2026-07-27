# Architecture & decisions

## Purpose

Remove Mix/radio and playlist context from YouTube watch pages so the video
plays standalone (no queue, no forced autoplay). Must be invisible: no reload,
no flash, no user action.

## Core constraint

The Mix is **server-rendered from the request URL**. `watch?v=X&list=RD…`
returns HTML whose `ytInitialData` already contains the full queue. Therefore
anything that runs after the request is too late:

- `history.replaceState` / editing `location` post-load → cosmetic only; queue
  still loaded and playing.
- `document_start` content script → still after the server responded.

Fix only works **before the request is sent**: strip the playlist params so the
server never builds the queue.

## Engine

- **DNR (Chrome, primary):** dynamic `declarativeNetRequest` rule redirects
  `youtube.com/watch` requests, removing `list`/`index`/`pp`/`start_radio` before
  send. Redirect replaces the URL (no history entry) → Back returns to the prior
  page. Scoped to `/watch`, so `/playlist` is untouched. `t` and other params
  preserved.
- **Content script (fallback):** in-app SPA Mix clicks send no `main_frame`
  request, so DNR misses them. On URL change → `location.replace(clean)` (one
  reload, Back-safe). Also the cleaning path on non-DNR browsers. Detection is
  layered because no single signal covers both YouTube apps: `yt-navigate-finish`
  (desktop only; m.youtube.com never fires it), `state-navigateend` on window
  (mobile app), Navigation API `currententrychange` (Chrome 102+/Firefox 147+),
  `popstate` (back/forward only; pushState never fires it), and a MutationObserver
  URL check as the engine-agnostic fallback. 1.5.0 shipped with only
  yt-navigate-finish + popstate, which broke all mobile in-app cleaning.
- **The reload has a cost, and offline playback cannot pay it.** `location.replace`
  turns a client-side SPA navigation into a network navigation. YouTube Premium
  downloads play from local storage specifically when the network is unavailable, so
  cleaning one swaps a working video for a failed load. `content.js` therefore skips
  cleaning when `navigator.onLine` is false or the watch page was opened from
  `/feed/downloads` (tracked via `previousPath`). DNR needs no equivalent guard: it
  only rewrites `main_frame` requests, which are network navigations already.
- **Content-script scoping gotcha:** in Firefox content scripts `globalThis` is a
  sandbox global distinct from `window` (in Chrome they are the same object). Any
  API shared between content-script files must be written AND read through
  `globalThis`; writing `globalThis.X` and reading `window.X` is undefined on
  Firefox and killed the whole cleaner in 1.5.0.
- **Service worker (`background.js`):** rebuilds DNR rules from settings on
  install/startup/storage-change.
- **`url-cleaner.js`:** single source of truth for settings model + cleaning
  decision (unit-tested). `normalizeSettings` migrates legacy `{ mode }`.

## Settings → rules (`rules.js`)

Settings: `{ enabled, cleanMixes, cleanPlaylists }`. Mix = list id `RD…`/`UL…`.

- both → redirect any `list=`
- mixes only → redirect `list=RD…`/`UL…`
- playlists only → allow `RD…`/`UL…` (higher priority) + redirect any `list=`
- disabled / neither → no rules

## Permissions

An update that adds a permission which triggers an install **warning** disables
the extension for existing users until they re-accept it — so never add a warning
permission casually.

- `storage`, `declarativeNetRequestWithHostAccess` — no install warning, and (with
  the `youtube.com` host permission) cover everything: DNR rewrites the requests,
  storage holds the settings.
- `tabs` — **dropped, and don't add it back lightly.** It warns ("read your
  browsing history") and nothing uses it: its only consumer was the old background
  watcher (`tabs.onUpdated` read each tab's URL to find watch pages), which the DNR
  engine replaced. YouTube-scoped tab features (e.g. sorting open YouTube tabs by
  duration) do **not** need it either — the host permission already exposes YouTube
  tabs' url/title, content scripts read page data, and `tabs.move` needs no
  permission. `tabs` is only justifiable if TubePlus becomes a general cross-site
  tab manager that reads non-YouTube tabs — a scope change a "YouTube URL cleaner"
  listing can't justify to review. Add it only alongside that pivot, accepting the
  one-time re-enable then.
- Net change published → 1.5.0: `+storage`, `+declarativeNetRequestWithHostAccess`
  (both warning-free), `tabs` removed → seamless update, no re-enable.
- **`optional_host_permissions` (Firefox) — tried in 1.5.1, withdrawn in 1.5.2.**
  Declaring `*://*.youtube.com/*` in `host_permissions` + `optional_host_permissions`
  and shipping a "Grant access" popup card was a fix for a problem the store build
  does not have (see Cross-browser below). It cost a `strict_min_version` bump to
  128, which strands every Firefox user below 128, and the card shows a scary
  "TubePlus can't see YouTube pages" message in any profile where the origin is not
  explicitly granted — including temporary add-ons loaded from about:debugging,
  which is exactly how the build gets smoke-tested. **Both manifests are now
  byte-identical to the shipped 1.5.0 except the version string. Keep them that
  way; verify with `diff` against `git show bac3d08:src/<browser>/manifest.json`
  before any release.**

## Cross-browser

Firefox ships without DNR (its `queryTransform` support unverified) → uses the
content-script path (correct, brief reload). `background.js`/`rules.js` copied to
the Firefox build but unused. Upgrade only after verifying live — MDN documents
DNR + `queryTransform.removeParams` since Firefox 113, so this is likely viable,
but it would NOT bypass the host-permission gate below (redirects need the grant).

**Firefox MV3 host permissions are user-granted, not automatic** — but the store
build is fine, and 1.5.1 misread this. Content scripts only run on granted origins,
and from Firefox 127 the origins in **both `host_permissions` and
`content_scripts.matches`** are shown in the install prompt and granted at install
(Bugzilla 1889402). 1.5.0 requests `*://*.youtube.com/*` via `content_scripts.matches`,
so every AMO install already holds the grant. The rule that bites is the other one:
**an update is never granted a NEW origin** (Bugzilla 1893232). Since 1.5.2 requests
exactly the origin 1.5.0 already requested, there is nothing new to grant and the
update is seamless.

What that leaves is only the genuine edge cases — a user who revoked access from the
extensions button, or a temporary add-on from about:debugging (no install prompt, so
no grant). Those are not worth a permission-request UI in the popup: the card in
1.5.1 fired on exactly those cases and told working installs they were broken. If a
"you have revoked access" affordance is ever wanted again, gate it on **observed
failure** (a youtube.com tab where the content script does not answer a ping), never
on `permissions.contains`, and check what it does under a temporary add-on first.

## Next feature

Durations across tabs / sorting open YouTube tabs: the content script reads each
video's length and reports via `sender.tab`; reordering uses `tabs.move`. Fully
doable **without** the `tabs` permission (YouTube host access + content script +
`tabs.move`). Only reach for `tabs` if a feature must read non-YouTube tabs.
