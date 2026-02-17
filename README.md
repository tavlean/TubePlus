# TubePlus

A cross-browser extension that cleans YouTube watch URLs by removing playlist/mix parameters when opening a specific video. Supports Chrome and Firefox from a shared codebase.

## Features

- Automatically removes `list` parameter from `youtube.com/watch` URLs
- Keeps users on the direct video URL (`?v=...`) instead of mix/playlist context
- Handles YouTube SPA navigation and dynamic URL changes
- Lightweight MV3 architecture with shared code for both browsers

## Installation

### Chrome

#### Development (unpacked)

1. Clone this repository
2. Run `npm run dev:chrome`
3. Open `chrome://extensions/`
4. Enable Developer mode
5. Click Load unpacked and select `dist/chrome-dev`

#### Production build

1. Run `npm run build:chrome`
2. Use `dist/tubeplus-chrome.zip`

### Firefox

#### Development (temporary add-on)

1. Clone this repository
2. Run `npm run dev:firefox`
3. Open `about:debugging#/runtime/this-firefox`
4. Click Load Temporary Add-on
5. Select `dist/firefox-dev/manifest.json`

#### Production build

1. Run `npm run build:firefox`
2. Use `dist/tubeplus-firefox.zip`

## Development

```bash
npm install

# Prepare dev folders
npm run dev
npm run dev:chrome
npm run dev:firefox

# Produce store zip files
npm run build
npm run build:chrome
npm run build:firefox

# Remove generated artifacts
npm run clean
```

## Project Structure

```
TubePlus/
├── README.md
├── LICENSE
├── package.json
├── .gitignore
├── docs/
├── assets/              # Store/marketing assets
├── shared-assets/       # Shared extension icons/assets (source)
├── src/
│   ├── common/          # Shared extension runtime files
│   │   ├── background.js
│   │   └── content.js
│   ├── chrome/          # Chrome shell
│   │   └── manifest.json
│   └── firefox/         # Firefox shell
│       └── manifest.json
└── dist/                # Generated dev/build artifacts
```

## License

MIT
