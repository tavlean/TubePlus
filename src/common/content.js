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
// sessionStorage is per-tab and survives navigation, which is the exact scope.
//
// The signal is what the document STARTED at, not how often we have cleaned. A loop
// looks like: we clean to T, the document loads at T, the page puts the playlist
// context back, and we are asked for T again - so the document began at T. A user
// simply opening the same Mix again does not look like that: their document begins at
// the dirty URL. Counting attempts instead of loops is what made an earlier version of
// this guard refuse a legitimate third visit to the same video.
const LOOP_KEY = "tubeplus.loop";
const LOOP_LIMIT = 3;
const initialURL = window.location.href;

function loopGuardAllows(targetURL) {
    if (initialURL !== targetURL) {
        // Not a loop: this document did not start at the URL we are producing. Clear
        // any stale count so an earlier loop cannot penalise ordinary browsing.
        try {
            sessionStorage.removeItem(LOOP_KEY);
        } catch (error) {
            // Storage unavailable; nothing to clear.
        }
        return true;
    }

    let seen = 0;

    try {
        const state = JSON.parse(sessionStorage.getItem(LOOP_KEY) || "null");
        if (state && state.url === targetURL) {
            seen = state.count;
        }
    } catch (error) {
        // Storage unreadable: clean rather than stall, and skip the bookkeeping.
        return true;
    }

    if (seen + 1 >= LOOP_LIMIT) {
        return false;
    }

    try {
        sessionStorage.setItem(LOOP_KEY, JSON.stringify({ url: targetURL, count: seen + 1 }));
    } catch (error) {
        // Storage unwritable; proceed without the guard rather than stop cleaning.
    }

    return true;
}

// location.replace() does not stop this document: script keeps running until the new
// response commits, so more navigation signals can arrive and ask us to clean the same
// URL again. Without this flag one navigation would burn several of the loop guard's
// attempts and could get a later, perfectly legitimate clean refused.
let replacing = false;

function cleanCurrentURL() {
    if (replacing || isOfflinePlayback()) {
        return false;
    }

    const result = cleanYouTubeWatchURL(window.location.href, settings);

    if (result.changed && window.location.href !== result.url && loopGuardAllows(result.url)) {
        replacing = true;
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
