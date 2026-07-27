// Shared pieces for the live-YouTube end-to-end suites (chromium.e2e.js,
// firefox.e2e.js). These tests exercise the real extension against the real
// site, so they are slower and network-dependent by design; run them before
// every store release. Unit tests stay in test/*.test.js.

const MIX_URL = "https://www.youtube.com/watch?v=Zi_XLOBDo_Y&list=RDZi_XLOBDo_Y&start_radio=1";
const CLEAN_URL = "https://www.youtube.com/watch?v=Zi_XLOBDo_Y";

const PLAYLIST_PARAMS = ["list", "index", "pp", "start_radio"];

function hasPlaylistContext(url) {
    const params = new URL(url).searchParams;
    return PLAYLIST_PARAMS.some((param) => params.has(param));
}

// Polls check() until it returns a truthy value or the timeout elapses.
async function pollUntil(check, timeoutMs, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs;
    let result = await check();
    while (!result && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        result = await check();
    }
    return result;
}

// Runs in the page (serialized by both Playwright and Selenium): clicks the
// first Mix link (falling back to any playlist link) to trigger an in-app SPA
// navigation, and returns the clicked href.
function clickMixLink() {
    const links = Array.from(document.querySelectorAll('a[href*="list="]'));
    const mix = links.find((a) => /[?&]list=RD/.test(a.getAttribute("href") || ""));
    const target = mix || links[0];
    if (!target) {
        return null;
    }
    const href = target.getAttribute("href");
    target.click();
    return href;
}

// Minimal reporter: prints per-check lines and sets a failing exit code.
function createReport(suiteName) {
    let failed = false;

    return {
        check(name, pass, detail) {
            failed = failed || !pass;
            console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
        },
        skip(name, reason) {
            console.log(`SKIP  ${name}  (${reason})`);
        },
        finish() {
            console.log(failed ? `${suiteName}: FAILED` : `${suiteName}: all checks passed`);
            process.exitCode = failed ? 1 : 0;
        }
    };
}

module.exports = { MIX_URL, CLEAN_URL, hasPlaylistContext, pollUntil, clickMixLink, createReport };
