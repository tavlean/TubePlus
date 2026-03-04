# TubePlus — Feature Ideas

> Current permissions: `tabs`, host_permissions `*://*.youtube.com/*`

---

## New Features

### 1. Popup UI with Toggle & Status

TubePlus has no popup — it's fully automatic with zero user control. Add a minimal popup showing:

- A master toggle to enable/disable URL cleaning
- A counter of how many URLs have been cleaned this session
- The current video ID being watched
- A quick-copy button for the clean URL

**Permissions:** `storage` (new) — to persist the toggle state and counters.
**UX:** Keep it minimal — a single card with the toggle, a small stat line, and the copy button. Match the dark aesthetic of the other extensions. No settings page needed initially; the popup is the settings.

### 2. Allowlist Specific Playlists

Some users want to stay in a playlist context (study playlists, courses, music albums). Allow users to allowlist specific playlist IDs so those `list=` parameters are preserved.

**Permissions:** `storage` (new) — to persist the allowlist.
**UX:** Add an "Allow this playlist" button in the popup when the current page has a `list` parameter. Show a small list of allowlisted playlists (name + ID) with swipe-to-remove. Cap at ~20 entries.

### 3. Strip Additional Tracking Parameters

YouTube URLs carry noise params beyond `list`: `si`, `feature`, `pp`, `index`, `ab_channel`, `utm_*`. Offer configurable parameter stripping with sensible defaults.

**Permissions:** No new permissions needed.
**UX:** In the popup or a small settings section, show a checklist of known YouTube parameters with toggles. Default: strip `list`, `si`, `feature`, `pp`, `index`, `ab_channel`. Keep `v` and `t` (timestamp) by default.

### 4. Clean Shorts URLs

YouTube Shorts (`youtube.com/shorts/VIDEO_ID`) carry query parameters too. Extend cleaning to Shorts, and optionally redirect Shorts to the regular `/watch?v=` player for users who prefer the full player.

**Permissions:** No new permissions needed. (Content script already matches `*://*.youtube.com/*`.)
**UX:** Add a "Shorts → Full Player" toggle in the popup. When enabled, `youtube.com/shorts/abc123` becomes `youtube.com/watch?v=abc123`. Show a small indicator when a redirect happened.

### 5. Clean & Copy to Clipboard

A context menu item or keyboard shortcut that takes the current page URL, strips all noise params, and copies the clean URL to the clipboard. Essential for sharing links.

**Permissions:** `contextMenus` (new) — for the right-click menu item. Clipboard write is available via `navigator.clipboard.writeText()` in content scripts without extra permissions.
**UX:** Right-click anywhere on a YouTube page → "Copy Clean URL". Brief toast notification: "Clean URL copied!" Also add a copy button in the popup if popup exists.

### 6. Badge Indicator

Show a small badge on the extension icon when a URL was cleaned on the current tab. Gives confidence the extension is working.

**Permissions:** No new permissions needed. (`chrome.action.setBadgeText` is available without extra permissions.)
**UX:** Show a "✓" badge for 3 seconds after cleaning, then clear. Or show a running count of cleanings for the current session. Use a green badge background.

### 7. Cleaning History / Log

Keep a lightweight log (last 50 entries) of original → cleaned URL pairs. Accessible from the popup.

**Permissions:** `storage` (new) — to persist the log.
**UX:** A scrollable list in the popup showing: video title (if available), original URL (truncated), cleaned URL, and timestamp. Click to copy the clean URL. "Clear history" button at the bottom.

### 8. YouTube Music Support

YouTube Music (`music.youtube.com`) has similar mix/playlist URL patterns. Extend cleaning support with a separate toggle.

**Permissions:** No new permissions needed. (Host permission `*://*.youtube.com/*` already covers `music.youtube.com`.)
**UX:** Add a "YouTube Music" toggle in the popup. Independent from the main YouTube toggle. Same cleaning logic, different domain detection.

### 9. Preserve Timestamp on Clean

When a URL is cleaned and the page reloads, the video restarts from the beginning. Preserve the `t` (timestamp) parameter so users don't lose their place, especially important for long videos.

**Permissions:** No new permissions needed.
**UX:** On by default. When cleaning, if the video has been playing for >10 seconds, append `&t=Xs` to the clean URL. Add a toggle: "Preserve playback position when cleaning".

### 10. Auto-Clean on Share Dialog

YouTube's native share dialog generates URLs with tracking params. Intercept the share dialog and auto-clean the URL before it's copied. Users share clean links without thinking about it.

**Permissions:** No new permissions needed. (Content script DOM manipulation.)
**UX:** Invisible to the user — the share dialog just produces clean URLs. Add a subtle "Cleaned by TubePlus" tooltip on the share URL field. Toggle in settings: "Auto-clean share URLs".

---

## UX Improvements

### Avoid Full Page Reload (Critical)

The current implementation does `window.location.href = cleanURL` which causes a full page reload — the video restarts, the page flashes, and it's disruptive. Use `history.replaceState()` to silently update the URL without reloading. The video keeps playing, the playlist context is just removed from the URL bar. This is the single most impactful improvement possible and should be prioritized above all new features.

### Debounce / Guard Against Redundant Cleanings

The content script has four overlapping triggers (background message, initial load, `yt-navigate-finish`, MutationObserver) all calling `handleURLChange()`. This can cause multiple rapid-fire cleanings. Add a debounce or a timestamp guard: if a cleaning happened within the last 500ms, skip.

### Remove Console Logging in Production

`console.log("YouTube URL Cleaner content script loaded")` and background response logging should be stripped or gated behind a `DEBUG` flag for production builds.

### Handle Edge Cases

- Playlist overview pages (`youtube.com/playlist?list=...`) with no `v` param should be left alone — verify this.
- Embedded YouTube URLs (`youtube.com/embed/`) should be excluded.
- `youtube.com/live/` URLs can carry playlist params — decide whether to clean those.
- Channel pages with `/videos` or `/streams` tabs should never be affected.

### Extension Icon State

The extension icon is static. Use `chrome.action.setIcon()` to show a grayed-out icon when on non-YouTube pages and a colored icon when active on YouTube. Gives immediate visual feedback about whether the extension is relevant to the current page.

---

## Monetisation Ideas

### TubePlus Pro — Universal URL Cleaner

Expand beyond YouTube to clean tracking parameters from all URLs across the entire web — Amazon (`tag`, `ref`), Twitter (`ref_src`), Facebook (`fbclid`), Google (`utm_*`, `gclid`), and hundreds of other sites. Maintain a curated, regularly-updated database of known tracking parameters per domain. This is a genuine data curation problem — the database needs constant maintenance as sites change their URL schemes, and false positives (stripping params that actually matter) need careful handling. A vibe-coded version would break constantly; a maintained one has real value.

**Permissions:** Would need broad host permissions or `webRequest`/`declarativeNetRequest` for cross-site operation.

### TubePlus Pro — YouTube Workflow Automation

A power-user toolkit for YouTube:

- Auto-add cleaned videos to a "Watch Later" playlist via YouTube API
- Batch-clean and export a list of video URLs from a playlist
- Auto-skip sponsored segments (integrate with SponsorBlock API data)
- Auto-skip intros/outros based on chapter markers
- Queue system: right-click videos to add to a local queue, play them in sequence without playlist context

This requires YouTube Data API integration (OAuth, quota management, error handling), a local queue state machine, and careful UX for the automation flows. The API integration alone (auth flow, token refresh, quota tracking, error recovery) is substantial.

**Permissions:** `identity` (new) for OAuth, `storage`, potentially `offscreen` for background API calls.

### TubePlus Pro — Distraction-Free YouTube Mode

A comprehensive YouTube focus mode:

- Hide recommendations sidebar, end-screen suggestions, and autoplay
- Hide comments section (toggle)
- Hide Shorts shelf on the home page
- Customizable home page: show only subscriptions, hide trending/explore
- Playback speed memory per channel (e.g., always 2x for podcasts, 1x for music)
- Watch time tracking with daily limits and break reminders

This is a full YouTube experience overhaul. The DOM manipulation needs to be resilient to YouTube's frequent layout changes (they ship multiple times per week), which means robust selectors, mutation observers with smart targeting, and a maintenance commitment. The per-channel speed memory and watch time tracking require persistent state management that's easy to get wrong.

### TubePlus Pro — Smart Playlist Manager

For users who curate playlists heavily:

- Detect and remove duplicate videos across playlists
- Auto-sort playlists by duration, upload date, or channel
- Playlist backup/export to JSON or CSV
- "Smart playlists" that auto-populate based on rules (e.g., "all videos from channel X shorter than 10 minutes")
- Playlist diff: see what changed since last visit

Requires YouTube Data API with full playlist read/write access, efficient diffing algorithms, and a rule engine for smart playlists. The API quota management alone (YouTube's API has strict daily quotas) requires careful batching and caching.

**Permissions:** `identity` (new) for OAuth, `storage`.
