// On Chrome the declarativeNetRequest rule strips playlist context before the page
// loads, so this script is usually a no-op there. It exists to cover in-app SPA
// navigations (clicking a Mix while already on YouTube) and browsers without DNR.

// Read from globalThis, not window: url-cleaner.js attaches the API to globalThis,
// and in Firefox content scripts the sandbox global is not the same object as window.
const { DEFAULT_SETTINGS, normalizeSettings, cleanYouTubeWatchURL } = globalThis.TubePlusUrlCleaner;

let settings = Object.assign({}, DEFAULT_SETTINGS);
let settingsLoaded = false;
let lastSeenURL = window.location.href;
let previousPath = new URL(lastSeenURL).pathname;

// Cleaning here costs a full document load, and a full document load needs the
// network. Premium downloads play from local storage precisely when the network is
// unavailable, so cleaning one would trade a working offline video for an error
// page. A clean URL is never worth a broken video.
const DOWNLOADS_PATH = "/feed/downloads";

function isOfflinePlayback() {
    return navigator.onLine === false || previousPath === DOWNLOADS_PATH;
}

// Any surface that re-adds playlist context after our reload would loop forever, and
// each reload starts a fresh document, so an in-memory counter can never see it.
// sessionStorage is per-tab and survives navigation, which is the exact scope of the
// loop. A loop has a signature: we keep producing the same clean URL.
const LOOP_KEY = "tubeplus.lastClean";
const LOOP_LIMIT = 2;
// A loop re-fires within a second or two. Revisiting the same video later in the
// session is ordinary, so repeats only count inside this window.
const LOOP_WINDOW_MS = 15000;

function loopGuardAllows(targetURL) {
    let state = null;

    try {
        state = JSON.parse(sessionStorage.getItem(LOOP_KEY) || "null");
    } catch (error) {
        // Storage unreadable: clean rather than stall, and skip the bookkeeping.
        return true;
    }

    const now = Date.now();
    const isRecentRepeat = state && state.url === targetURL && now - state.at < LOOP_WINDOW_MS;
    const repeats = isRecentRepeat ? state.repeats + 1 : 1;

    if (repeats > LOOP_LIMIT) {
        return false;
    }

    try {
        sessionStorage.setItem(LOOP_KEY, JSON.stringify({ url: targetURL, repeats, at: now }));
    } catch (error) {
        // Storage unwritable; proceed without the guard rather than stop cleaning.
    }

    return true;
}

function cleanCurrentURL() {
    if (isOfflinePlayback()) {
        return false;
    }

    const result = cleanYouTubeWatchURL(window.location.href, settings);

    if (result.changed && window.location.href !== result.url && loopGuardAllows(result.url)) {
        // replace(), not assign(), so the dirty URL never enters history.
        window.location.replace(result.url);
        return true;
    }

    return false;
}

// Every navigation signal funnels through here so previousPath always describes the
// page we came from, which is what tells us a watch page was opened from Downloads.
function maybeClean() {
    const currentURL = window.location.href;

    if (currentURL !== lastSeenURL) {
        previousPath = new URL(lastSeenURL).pathname;
        lastSeenURL = currentURL;
    }

    if (settingsLoaded) {
        cleanCurrentURL();
    }
}

function loadSettings() {
    chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
        if (!chrome.runtime.lastError) {
            settings = normalizeSettings(stored);
        }
        settingsLoaded = true;
        cleanCurrentURL();
    });
}

// SPA navigations never hit the network, so they must be caught in-page. Desktop
// YouTube announces them with yt-navigate-finish on document; the mobile web app
// (m.youtube.com) fires state-navigateend on window instead. popstate covers
// back/forward traversals (it never fires for pushState).
document.addEventListener("yt-navigate-finish", maybeClean);
window.addEventListener("state-navigateend", maybeClean);
window.addEventListener("popstate", maybeClean);

// Navigation API (Chrome 102+, Firefox 147+): fires after every history commit,
// independent of YouTube's own events.
if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("currententrychange", maybeClean);
}

// Fallback for engines without the Navigation API: YouTube mutates the DOM on every
// navigation, so a cheap URL comparison on mutations catches missed changes.
new MutationObserver(() => {
    if (window.location.href !== lastSeenURL) {
        maybeClean();
    }
}).observe(document, { subtree: true, childList: true });

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }

    const merged = Object.assign({}, settings);
    for (const key of Object.keys(changes)) {
        merged[key] = changes[key].newValue;
    }
    settings = normalizeSettings(merged);

    maybeClean();
});

loadSettings();
