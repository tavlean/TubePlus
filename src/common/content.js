const DEFAULT_SETTINGS = {
    enabled: true,
    mode: TubePlusUrlCleaner.DEFAULT_OPTIONS.mode
};

let settings = Object.assign({}, DEFAULT_SETTINGS);
let settingsLoaded = false;

function cleanCurrentURL() {
    if (!settings.enabled) {
        return false;
    }

    const result = TubePlusUrlCleaner.cleanYouTubeWatchURL(window.location.href, {
        mode: settings.mode
    });

    if (result.changed && window.location.href !== result.url) {
        window.history.replaceState(window.history.state, "", result.url);
        return true;
    }

    return false;
}

function handleURLChange() {
    const cleaned = cleanCurrentURL();
    lastURL = window.location.href;
    return cleaned;
}

let lastURL = window.location.href;

function handlePossibleURLChange() {
    const currentURL = window.location.href;

    if (currentURL !== lastURL) {
        handleURLChange();
    }
}

function loadSettings() {
    chrome.storage.local.get(DEFAULT_SETTINGS, (storedSettings) => {
        if (chrome.runtime.lastError) {
            settingsLoaded = true;
            handleURLChange();
            return;
        }

        settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);
        settingsLoaded = true;
        handleURLChange();
    });
}

document.addEventListener("yt-navigate-finish", handlePossibleURLChange);
window.addEventListener("popstate", handlePossibleURLChange);
window.addEventListener("pageshow", handlePossibleURLChange);

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (changes[key]) {
            settings[key] = changes[key].newValue;
        }
    }

    if (settingsLoaded) {
        handleURLChange();
    }
});

loadSettings();
