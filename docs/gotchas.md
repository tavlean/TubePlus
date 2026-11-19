# Gotchas

- **`[hidden]` loses to author CSS.** A rule like `.card { display: grid }` overrides the user-agent `[hidden] { display: none }`, so a hidden element shows. This caused the live 1.5.1 incident (see the 2026-07-27 worklog entry). Pair any `display` rule on a toggled element with an explicit `[hidden]` rule.
- **Firefox content scripts: `window` is not `globalThis`.** Shared code attached to `globalThis` in `url-cleaner.js` is not visible through `window` in `content.js` on Firefox.
- **m.youtube.com does not fire `yt-navigate-finish`.** It fires `state-navigateend` on `window`. `popstate` never fires for pushState.
- **The e2e gates need Playwright's matching Chromium build.** After a Playwright upgrade, run `pnpm exec playwright install chromium` or `test:smoke` and `test:offline` fail before testing anything.
