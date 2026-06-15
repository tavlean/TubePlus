// On Chrome the declarativeNetRequest rule strips playlist context before the page
// loads, so this script is usually a no-op there. It exists to cover in-app SPA
// navigations (clicking a Mix while already on YouTube) and browsers without DNR.

const { DEFAULT_SETTINGS, normalizeSettings, cleanYouTubeWatchURL } = window.TubePlusUrlCleaner;

let settings = Object.assign({}, DEFAULT_SETTINGS);
let settingsLoaded = false;

function cleanCurrentURL() {
    const result = cleanYouTubeWatchURL(window.location.href, settings);

    if (result.changed && window.location.href !== result.url) {
        // replace(), not assign(), so the dirty URL never enters history.
        window.location.replace(result.url);
        return true;
    }

    return false;
}

function maybeClean() {
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

document.addEventListener("yt-navigate-finish", maybeClean);
window.addEventListener("popstate", maybeClean);

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
