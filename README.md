# TubePlus

A cross-browser extension that cleans YouTube watch URLs by removing playlist/mix context while keeping useful video parameters like timestamps. Supports Chrome and Firefox from a shared codebase.

## Features

- Automatically removes playlist context from `youtube.com/watch` URLs
- Keeps useful direct-video parameters such as `t` and `feature`
- Lets users pause cleaning or limit cleaning to YouTube Mix/radio URLs
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
├── store-assets/        # Store/marketing assets
├── shared-assets/       # Shared extension icons/assets (source)
├── scripts/             # Build/package helpers
├── src/
│   ├── common/          # Shared extension runtime files
│   │   ├── content.js
│   │   ├── popup.*
│   │   └── url-cleaner.js
│   ├── chrome/          # Chrome shell
│   │   └── manifest.json
│   └── firefox/         # Firefox shell
│       └── manifest.json
└── dist/                # Generated dev/build artifacts
```

## License

MIT
