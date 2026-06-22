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
  request, so DNR misses them. `yt-navigate-finish` → `location.replace(clean)`
  (one reload, Back-safe). Also the cleaning path on non-DNR browsers.
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

## Cross-browser

Firefox ships without DNR (its `queryTransform` support unverified) → uses the
content-script path (correct, brief reload). `background.js`/`rules.js` copied to
the Firefox build but unused. Upgrade only after verifying live.

## Next feature

Durations across tabs / sorting open YouTube tabs: the content script reads each
video's length and reports via `sender.tab`; reordering uses `tabs.move`. Fully
doable **without** the `tabs` permission (YouTube host access + content script +
`tabs.move`). Only reach for `tabs` if a feature must read non-YouTube tabs.
