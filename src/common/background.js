// Chrome service worker: keeps the declarativeNetRequest rules in sync with settings.
// (Firefox does not register this; it cleans via the content script instead.)
importScripts("url-cleaner.js", "rules.js");

const { DEFAULT_SETTINGS, normalizeSettings } = self.TubePlusUrlCleaner;
const { RULE_IDS, buildDynamicRules } = self.TubePlusRules;

function applyRules() {
    if (!chrome.declarativeNetRequest) {
        return;
    }

    chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
        const settings = normalizeSettings(stored);
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: RULE_IDS,
            addRules: buildDynamicRules(settings)
        });
    });
}

chrome.runtime.onInstalled.addListener(applyRules);
chrome.runtime.onStartup.addListener(applyRules);

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }

    if (changes.enabled || changes.cleanMixes || changes.cleanPlaylists || changes.mode) {
        applyRules();
    }
});
