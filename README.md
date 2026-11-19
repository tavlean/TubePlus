# TubePlus

A cross-browser extension that cleans YouTube watch URLs by removing playlist/mix context while keeping useful video parameters like timestamps. Supports Chrome and Firefox from a shared codebase.

For how it works and the reasoning behind the key decisions, see [docs/architecture.md](docs/architecture.md).

## Features

- Removes Mix/playlist context from `youtube.com/watch` **before the page loads**, so the Mix never starts — no reload, no flash (Chrome, via declarativeNetRequest)
- Independent controls to clean Mixes & radio, Playlists, or turn cleaning off entirely
- Keeps useful video parameters such as the `t` timestamp
- Back button returns to the previous page, never the playlist
- Falls back to a content script for in-app (SPA) Mix clicks and for browsers without DNR
- Lightweight MV3 architecture with shared code for both browsers

## Installation

### Chrome

#### Development (unpacked)

1. Clone this repository
2. Run `pnpm run dev:chrome`
3. Open `chrome://extensions/`
4. Enable Developer mode
5. Click Load unpacked and select `dist/chrome-dev`

#### Production build

1. Run `pnpm run build:chrome`
2. Use `dist/tubeplus-chrome.zip`

### Firefox

#### Development (temporary add-on)

1. Clone this repository
2. Run `pnpm run dev:firefox`
3. Open `about:debugging#/runtime/this-firefox`
4. Click Load Temporary Add-on
5. Select `dist/firefox-dev/manifest.json`

#### Production build

1. Run `pnpm run build:firefox`
2. Use `dist/tubeplus-firefox.zip`

## Development

```bash
pnpm install

# Prepare dev folders
pnpm run dev
pnpm run dev:chrome
pnpm run dev:firefox

# Produce store zip files
pnpm run build
pnpm run build:chrome
pnpm run build:firefox

# Remove generated artifacts
pnpm run clean
```

## Project Structure

```
TubePlus/
├── README.md
├── LICENSE
├── package.json
├── .gitignore
├── docs/                # Context: architecture.md (design + decisions), changelog.md, privacy.md
├── store-assets/        # Store/marketing assets
├── shared-assets/       # Shared extension icons/assets (source)
├── scripts/             # Build/package helpers
├── src/
│   ├── common/          # Shared extension runtime files
│   │   ├── url-cleaner.js   # settings model + cleaning decision (unit-tested)
│   │   ├── rules.js         # builds declarativeNetRequest rules from settings
│   │   ├── background.js    # Chrome service worker: applies DNR rules
│   │   ├── content.js       # fallback for in-app SPA navigations / non-DNR browsers
│   │   └── popup.*          # popup UI
│   ├── chrome/          # Chrome shell (manifest with DNR + service worker)
│   │   └── manifest.json
│   └── firefox/         # Firefox shell (content-script path, no DNR)
│       └── manifest.json
└── dist/                # Generated dev/build artifacts
```

## License
MIT
