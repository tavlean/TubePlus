# Changelog

## 1.5.0 - 2026-06-22

- Rebuilt the cleaning engine on declarativeNetRequest: playlist/mix context is now stripped from the request before YouTube loads, so the page never enters a Mix and there is no reload or flash (Chrome). Replaces the previous approach that only edited the address bar after the Mix had already loaded.
- Added a content-script fallback for in-app navigations (clicking a Mix while already on YouTube) and for browsers without declarativeNetRequest; it cleans via `location.replace`, so the Back button always returns to the previous page rather than the playlist.
- Reworked the popup into a master switch plus independent "Mixes & radio" and "Playlists" toggles, so cleaning can be limited to either type or turned off entirely.
- Useful watch parameters (such as the `t` timestamp) are preserved while playlist context is removed.
- Permissions: added `storage` and `declarativeNetRequestWithHostAccess` (neither shows an install warning) and removed the now-unused `tabs` permission (the background watcher that relied on it was replaced by the declarativeNetRequest engine), so existing users update without having to re-enable the extension.

## 1.4.1 - 2025-09-25

- Published the latest store version of TubePlus.
- Added support for preparing TubePlus for both Chrome and Firefox from the same shared codebase.
- Added Firefox Manifest V3 packaging so the extension can be built for Firefox as well as Chrome.
- Organized extension icons, source files, documentation, and store assets into clearer project folders.
- Improved project documentation so installing, building, and understanding the extension is easier.
- Updated store and branding assets, including a dedicated TubePlus logo.
- Added a changelog file so future updates can be tracked in one place.

## 1.4 - 2025-09-25

- Initial public release of TubePlus.
- Automatically cleans YouTube watch URLs by removing playlist or mix context when opening a specific video.
- Keeps users on the direct video URL instead of leaving them inside a playlist or Mix flow.
- Runs locally in the browser as a lightweight extension.
- Included the first privacy policy, license, icons, and store listing assets.

## 1.3 - 2025-09-25

- Beta release focused on getting the YouTube URL cleaning flow ready for regular use.
- Continued refining how TubePlus detects playlist and Mix links on YouTube watch pages.
- Prepared the extension for public store submission.

## 1.2 - 2025-09-25

- Beta release with improvements to the core cleaning behavior.
- Continued testing TubePlus against YouTube watch links, playlist links, and Mix links.
- Made the extension easier to package and review before release.

## 1.1 - 2025-09-25

- Early beta release of TubePlus.
- Introduced the basic idea of opening YouTube videos outside playlist or Mix context.
- Used for initial testing before the public release.
