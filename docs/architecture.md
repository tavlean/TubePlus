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

Adding a permission that triggers an install **warning** disables the extension
for existing users until they re-enable. So: never add a warning permission
without a deliberate, communicated release, and **keep already-granted
permissions rather than dropping and re-adding them** (the re-add is what
disables everyone).

- `storage`, `declarativeNetRequestWithHostAccess` — no install warning.
- `tabs` — **KEEP IT. Do not remove.** It warns ("read your browsing history"),
  but the published version already grants it, so keeping it costs existing users
  nothing. Planned features (rearranging/sorting the user's tabs, cross-tab
  tooling) need it to read tab `url`/`title`/`favIconUrl` across sites. Dropping
  it now and re-adding later would disable the extension for every user until they
  re-enable — unacceptable. Note `tabs` gates only those sensitive Tab fields;
  `tabs.move`/`create`/`remove`/`activate` and reading content of tabs we already
  have host access to (e.g. YouTube) do not need it.
- Net change published → 1.5.0: `+storage`, `+declarativeNetRequestWithHostAccess`
  (both warning-free), `tabs` retained → seamless update, no re-enable.

## Cross-browser

Firefox ships without DNR (its `queryTransform` support unverified) → uses the
content-script path (correct, brief reload). `background.js`/`rules.js` copied to
the Firefox build but unused. Upgrade only after verifying live.

## Next feature

Durations across tabs and tab rearrangement: the content script reads each
video's length and reports via `sender.tab`; the retained `tabs` permission
covers reading other tabs' `url`/`title` and cross-tab features.
