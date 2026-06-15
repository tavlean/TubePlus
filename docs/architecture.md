# Architecture & decisions

Context for anyone (human or AI) working on TubePlus. This explains *why*
the extension is built the way it is, so the non-obvious decisions don't get
quietly reverted.

## What TubePlus does

When you open a YouTube video that is part of a Mix/radio or playlist, YouTube
traps you in that queue (endless autoplay, "Up next" pulled from the list).
TubePlus removes the playlist context so you watch just the video. It should
feel invisible — no flash, no reload, nothing for the user to do.

## The core constraint (read this before changing the engine)

**The Mix is not in the URL. It is server-rendered from the request URL.**

When the browser requests `watch?v=X&list=RD…`, YouTube's *server* returns HTML
whose `ytInitialData` already contains the full Mix queue. By the time any page
script runs, the Mix is already loaded. This was verified live.

Consequences — these approaches **do not work**, do not reintroduce them:

- `history.replaceState` / editing `location` after load — cosmetic only. The
  address bar looks clean but the Mix is loaded and keeps playing. (This was the
  bug in the previous implementation.)
- A `document_start` content script that rewrites the URL — still too late; the
  server already responded with the Mix baked in.

The only reliable fix is to **strip the playlist params before the request is
sent**, so the server never builds the Mix.

## How it works now

1. **declarativeNetRequest (primary, Chrome).** A dynamic DNR rule redirects
   `youtube.com/watch` requests, removing `list`/`index`/`pp`/`start_radio`
   before they leave the browser. The server returns a clean page → the Mix
   never exists. Invisible: no reload, no flash. Useful params like the `t`
   timestamp are preserved. The redirect *replaces* the URL (no extra history
   entry), so **Back returns to the real previous page, never the playlist**.
   Rules are scoped to `/watch`, so the `/playlist` manager page is untouched.

2. **Content script (fallback).** In-app navigations — clicking a Mix while
   already on YouTube — are SPA transitions that send no `main_frame` request,
   so DNR can't see them. The content script detects these (`yt-navigate-finish`)
   and re-navigates with `location.replace` (one clean reload, Back-safe). This
   is also the cleaning path for browsers without DNR (see Firefox below).

3. **Service worker (`background.js`, Chrome).** Translates settings into DNR
   dynamic rules on install/startup and whenever settings change.

4. **Popup + settings.** Master on/off plus independent `cleanMixes` /
   `cleanPlaylists`. Stored in `chrome.storage.local`. `url-cleaner.js` is the
   single source of truth for the settings model and the cleaning decision (and
   is unit-tested); `normalizeSettings` migrates the legacy `{ mode }` shape.

Rule mapping (`rules.js`):
- both on → one redirect rule on any `list=`
- mixes only → redirect only `list=RD…`/`UL…`
- playlists only → an **allow** rule on mixes (higher priority) + a redirect on
  any list, so mixes survive and other playlists are stripped
- disabled / nothing selected → no rules

## Permission philosophy (important)

Adding a permission that shows an install **warning** disables the extension for
every existing user until they manually re-enable it. So:

- **Never add a warning-triggering permission** without a deliberate, communicated
  release. Removing permissions is seamless; adding warned ones is not.
- We use `declarativeNetRequestWithHostAccess` (no warning) — **not**
  `declarativeNetRequest` (which *does* warn). `storage` is also warning-free.
- `tabs` was dropped (it warns "read your browsing history"). If a future feature
  needs tab access, prefer `activeTab` (no warning) or content-script
  self-reporting before reaching for `tabs`.
- Net effect of the 1.5.0 engine change vs. the published version: seamless
  update, fewer warnings — nobody re-enables.

## Cross-browser

- **Chrome:** full invisible DNR path.
- **Firefox:** ships **without** DNR (its support for DNR `queryTransform` is
  unverified). It relies on the content-script path, which is correct but causes
  a brief reload on Mix loads. Upgrade Firefox to DNR only after verifying
  support live. Per-browser manifests live in `src/chrome` and `src/firefox`;
  `background.js`/`rules.js` are copied to the Firefox build but unused there.

## Known tradeoffs

- In-app Mix clicks cost one reload (the content-script fallback). Acceptable and
  the minority case; direct loads/new tabs/shared links are fully invisible.
- The Firefox reload flash, as above.

## Likely next feature

"Durations across tabs" — list every open YouTube video's length so the user can
prioritize short ones. Buildable **without** a warning permission: the existing
content script reads each video's duration and reports to the service worker via
`sender.tab` (no `tabs` permission needed for collection). Keep it that way.
