TubePlus is a Chrome and Firefox MV3 extension that removes Mix and playlist context from YouTube watch URLs. Start with docs/README.md (the docs index) and docs/project/brief.md (what this is and where it stands). Read the docs related to your task BEFORE working and update the ones you invalidated after; the index routes you, so load only what the task needs.

## Style tie-breakers
Match the surrounding code by default. When the surroundings are mixed or absent and you are unsure which local style to follow, prefer these files:
- `src/common/url-cleaner.js` (domain logic shared by both engines)
- `src/common/rules.js` (declarativeNetRequest rule building)
- `scripts/build.js` (build tooling)

## Hard rules (every task; all how-to detail lives in docs/)
- Commit checkpoint-sized changes regularly. Push finished work whose gates pass without asking; never force-push.
- One source of truth per topic.
- Never add a permission that triggers an install warning (for example `tabs`) without Tavlean's approval: it disables the extension for every user until they accept it. Read docs/architecture.md before touching either manifest.
- Never upload to the Chrome Web Store or Firefox AMO, and never state release status from the docs; check the store dashboards.
- Before finishing code work: `pnpm test`, `pnpm run build`, `pnpm run test:smoke`, `pnpm run test:offline`. Add nothing, break nothing (silent traps: docs/gotchas.md).
- No em dashes in anything you write; rewrite the sentence to be simpler instead.
- Note your gotcha discoveries in your final report so the worklog can capture them.
